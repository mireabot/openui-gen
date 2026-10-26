import Foundation

public struct OpenUIPrimitiveArgument: Decodable, Sendable {
    public let name: String
    public let role: String
    public let optional: Bool?
}

public struct OpenUIPrimitiveDefinition: Decodable, Sendable {
    public let name: String
    public let args: [OpenUIPrimitiveArgument]
}

public struct OpenUICatalog: Decodable, Sendable {
    public let version: Int
    public let digest: String
    public let primitives: [OpenUIPrimitiveDefinition]
    public static func bundled() throws -> Self {
        guard let url = Bundle.main.url(forResource: "primitives", withExtension: "json") else {
            throw OpenUIError.syntax("Missing generated OpenUI catalog")
        }
        return try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
    }
}

/// One evaluation owner. Source-read indexes describe consumers; this first implementation
/// evaluates a complete immutable scene, then the runtime publishes only semantic changes.
public struct OpenUICompiler {
    private let definitions: [String: OpenUIPrimitiveDefinition]
    public init(catalog: OpenUICatalog? = nil) throws {
        let catalog = try catalog ?? .bundled()
        definitions = Dictionary(uniqueKeysWithValues: catalog.primitives.map { ($0.name, $0) })
    }

    public func compile(
        program source: String,
        documentID: String,
        datasets: [OpenUIDataset],
        edits: [OpenUIEditAddress: Double] = [:],
        allowIncomplete: Bool = false
    ) throws -> OpenUIScene {
        var parser = OpenUIParser(); let program = try parser.parse(source, allowIncomplete: allowIncomplete)
        var evaluator = Evaluator(
            definitions: definitions,
            program: program,
            documentID: documentID,
            datasets: datasets,
            edits: edits
        )
        guard let root = program.statements["root"] else { return .init(roots: [], elements: [:], reads: [:]) }
        let value = try evaluator.evaluate(root, mount: "root", context: .init(), stack: ["root"])
        return .init(roots: value.nodes, elements: evaluator.elements, reads: evaluator.reads)
    }
}

private struct Evaluated {
    var value: PValue = .null
    var source: OpenUISourceAddress?
    var nodes: [OpenUIElementID] = []
}

private struct Context {
    var aliases: [String: Evaluated] = [:]
    var calculation: OpenUIElementID?
    var calculationSource: OpenUISourceAddress?
    var calculationValues: PValue?
}

private struct Evaluator {
    let definitions: [String: OpenUIPrimitiveDefinition]
    let program: OpenUIProgram
    let documentID: String
    let datasets: [OpenUIDataset]
    let edits: [OpenUIEditAddress: Double]
    var elements: [OpenUIElementID: OpenUISemanticElement] = [:]
    var reads: [OpenUISourceAddress: Set<OpenUIElementID>] = [:]
    /// Statements mounted so far. A statement mounts under its own name the first time, so its
    /// elements keep their ids when the root reorders or gains parts.
    var mounted: Set<String> = []

    mutating func evaluate(
        _ expression: OpenUIExpression,
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        switch expression {
        case let .literal(value): .init(value: value)
        case let .reference(name): try reference(name, mount: mount, context: context, stack: stack)
        case let .member(base, name):
            try access(base, step: .field(name), mount: mount, context: context, stack: stack) { $0[name] }
        case let .index(base, index):
            try access(base, step: .index(index), mount: mount, context: context, stack: stack) { $0[index] }
        case let .array(expressions): try array(expressions, mount: mount, context: context, stack: stack)
        case let .object(expressions): try object(expressions, mount: mount, context: context, stack: stack)
        case let .call("Query", args): try query(expression, args: args, mount: mount, context: context, stack: stack)
        case let .call("Each", args): try each(args, mount: mount, context: context, stack: stack)
        case let .call(name, args): try element(name, args: args, mount: mount, context: context, stack: stack)
        }
    }

    private mutating func reference(
        _ name: String,
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        if let value = context.aliases[name] { return value }
        guard !stack.contains(name) else { throw OpenUIError.cyclicReference(name) }
        guard let expression = program.statements[name] else { return .init() }
        let path = mounted.insert(name).inserted ? "ref:" + name : mount + "/ref:" + name
        return try evaluate(expression, mount: path, context: context, stack: stack.union([name]))
    }

    private mutating func access(
        _ base: OpenUIExpression,
        step: OpenUIPathStep,
        mount: String,
        context: Context,
        stack: Set<String>,
        read: (PValue) -> PValue?
    ) throws -> Evaluated {
        let parent = try evaluate(base, mount: mount, context: context, stack: stack)
        var source = parent.source
        source?.path.append(step)
        return scoped(.init(value: read(parent.value) ?? .null, source: source), context: context)
    }

    private mutating func array(
        _ expressions: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        var values: [PValue] = [], nodes: [OpenUIElementID] = []
        for (index, child) in expressions.enumerated() {
            let result = try evaluate(child, mount: mount + "/\(index)", context: context, stack: stack)
            values.append(result.value)
            nodes += result.nodes
        }
        return .init(value: .list(values), nodes: nodes)
    }

    private mutating func object(
        _ expressions: [String: OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        var values: [String: PValue] = [:]
        for (name, expression) in expressions {
            values[name] = try evaluate(expression, mount: mount, context: context, stack: stack).value
        }
        return .init(value: .object(values))
    }

    private mutating func query(
        _ expression: OpenUIExpression,
        args: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        guard args.count >= 2 else { throw OpenUIError.syntax("Query requires tool and args") }
        let tool = try evaluate(args[0], mount: mount, context: context, stack: stack).value.stringValue ?? ""
        let arguments = try evaluate(args[1], mount: mount, context: context, stack: stack).value
        guard let dataset = datasets.last(where: { $0.tool == tool && $0.args == arguments })
        else { throw OpenUIError.missingQuery(tool) }
        // The alias is logical and stable across immutable snapshot/run changes.
        let alias = program.order.first(where: { program.statements[$0] == expression }) ?? "d"
        return .init(value: dataset.result, source: .init(query: alias))
    }

    private mutating func each(
        _ args: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        guard args.count == 3 else { throw OpenUIError.syntax("Each requires list, alias and template") }
        let list = try evaluate(args[0], mount: mount, context: context, stack: stack)
        let alias = try evaluate(args[1], mount: mount, context: context, stack: stack).value.stringValue ?? ""
        guard !alias.isEmpty, context.aliases[alias] == nil else { throw OpenUIError.syntax("Invalid Each alias") }
        var nodes: [OpenUIElementID] = []
        for (index, item) in (list.value.listValue ?? []).enumerated() {
            var child = context
            var source = list.source
            source?.path.append(.index(index))
            child.aliases[alias] = .init(value: item, source: source)
            nodes += try evaluate(args[2], mount: mount + "/item:\(index)", context: child, stack: stack).nodes
        }
        return .init(nodes: nodes)
    }

    private mutating func element(
        _ name: String,
        args: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        guard let definition = definitions[name] else { throw OpenUIError.unknownPrimitive(name) }
        guard args.count <= definition.args.count else { throw OpenUIError.syntax("Too many \(name) arguments") }
        let id = OpenUIElementID(rawValue: documentID + ":" + mount)
        var element = OpenUISemanticElement(
            id: id,
            kind: name,
            properties: [:],
            bindings: [:],
            sources: [:],
            slots: [:]
        )
        let childContext = name == "Calculation"
            ? try calculationContext(id, args: args, mount: mount, context: context, stack: stack)
            : context
        for (index, spec) in definition.args.enumerated() {
            let isSlot = spec.role == "node" || spec.role == "nodes"
            if isSlot { element.slots[spec.name] = [] }
            guard index < args.count else { continue }
            let result = try evaluate(args[index], mount: mount + "/" + spec.name, context: childContext, stack: stack)
            if isSlot { element.slots[spec.name] = result.nodes } else {
                assign(result, to: spec.name, of: &element, context: childContext)
            }
        }
        elements[id] = element
        return .init(nodes: [id])
    }

    /// A Calculation's children read its recomputed record; local edits overlay the sourced inputs.
    private mutating func calculationContext(
        _ id: OpenUIElementID,
        args: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Context {
        guard let first = args.first else { return context }
        let record = try evaluate(first, mount: mount + "/values", context: context, stack: stack)
        guard var inputs = record.value.objectValue, let source = record.source else { return context }
        for (address, value) in edits where address.element == id && address.source.query == source.query
            && address.source.path.starts(with: source.path)
        {
            inputs[address.input] = .number(value)
        }
        let model = args.count > 2
            ? try evaluate(args[2], mount: mount, context: context, stack: stack).value.stringValue ?? "compound-growth"
            : "compound-growth"
        var child = context
        child.calculation = id
        child.calculationSource = source
        child.calculationValues = .object(GrowthCalculation.evaluate(inputs, model: model))
        return child
    }

    private mutating func assign(
        _ result: Evaluated,
        to property: String,
        of element: inout OpenUISemanticElement,
        context: Context
    ) {
        element.properties[property] = result.value
        guard let source = result.source else { return }
        element.sources[property] = source
        reads[source, default: []].insert(element.id)
        if let calculation = context.calculation, let calculationSource = context.calculationSource,
           source.query == calculationSource.query, source.path.starts(with: calculationSource.path),
           case let .field(input)? = source.path.last, ["quantity", "months", "annualRate"].contains(input)
        {
            element.bindings[property] = .init(element: calculation, source: source, input: input)
        }
    }

    private func scoped(_ result: Evaluated, context: Context) -> Evaluated {
        guard let source = result.source, let base = context.calculationSource, source.query == base.query,
              source.path.starts(with: base.path), let values = context.calculationValues else { return result }
        var value = values
        for step in source.path.dropFirst(base.path.count) {
            switch step {
            case let .field(name): value = value[name] ?? .null; case let .index(index): value = value[index] ??
                .null
            }
        }
        return .init(value: value, source: source)
    }
}
