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

/// One evaluation owner. It evaluates a complete immutable scene, then the runtime publishes only
/// semantic changes. A call to a template (a Sports component such as `MatchCard`) evaluates the
/// template's body in its own scope, with each parameter bound to the call's argument.
public struct OpenUICompiler {
    private let definitions: [String: OpenUIPrimitiveDefinition]
    private let templates: [String: CompiledTemplate]
    public init(catalog: OpenUICatalog? = nil, templates: [OpenUITemplate]? = nil) throws {
        let catalog = try catalog ?? .bundled()
        definitions = Dictionary(uniqueKeysWithValues: catalog.primitives.map { ($0.name, $0) })
        self.templates = try Self.compiled(templates ?? OpenUITemplate.bundled())
    }

    private init(definitions: [String: OpenUIPrimitiveDefinition], templates: [String: CompiledTemplate]) {
        self.definitions = definitions; self.templates = templates
    }

    /// The same compiler drawing with `templates`, such as the ones a run or a saved screen carries.
    public func using(_ templates: [OpenUITemplate]) throws -> Self {
        try .init(definitions: definitions, templates: Self.compiled(templates))
    }

    private static func compiled(_ templates: [OpenUITemplate]) throws -> [String: CompiledTemplate] {
        func parse(_ text: String) throws -> OpenUIExpression {
            var parser = OpenUIParser()
            guard let expression = try parser.parse("t = " + text).statements["t"]
            else { throw OpenUIError.syntax("Empty template body") }
            return expression
        }
        return try Dictionary(templates.map { template in
            try (template.name, CompiledTemplate(
                name: template.name,
                params: template.params,
                defaults: template.params.map { try $0.default.map(parse) },
                body: parse(template.body)
            ))
        }, uniquingKeysWith: { _, last in last })
    }

    public func compile(
        program source: String,
        documentID: String,
        datasets: [OpenUIDataset],
        allowIncomplete: Bool = false
    ) throws -> OpenUIScene {
        var parser = OpenUIParser(); let program = try parser.parse(source, allowIncomplete: allowIncomplete)
        var evaluator = Evaluator(
            definitions: definitions,
            templates: templates,
            program: program,
            documentID: documentID,
            datasets: datasets
        )
        guard let root = program.statements["root"] else { return .init(roots: [], elements: [:]) }
        let value = try evaluator.evaluate(root, mount: "root", context: .init(), stack: ["root"])
        return .init(roots: value.nodes, elements: evaluator.elements)
    }
}

private struct Evaluated {
    var value: PValue = .null
    var nodes: [OpenUIElementID] = []
}

private struct CompiledTemplate {
    let name: String
    let params: [OpenUITemplate.Param]
    let defaults: [OpenUIExpression?]
    let body: OpenUIExpression
}

private struct Context {
    var aliases: [String: Evaluated] = [:]
}

private struct Evaluator {
    let definitions: [String: OpenUIPrimitiveDefinition]
    let templates: [String: CompiledTemplate]
    let program: OpenUIProgram
    let documentID: String
    let datasets: [OpenUIDataset]
    var elements: [OpenUIElementID: OpenUISemanticElement] = [:]
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
            try access(base, mount: mount, context: context, stack: stack) { $0[name] }
        case let .index(base, index):
            try access(base, mount: mount, context: context, stack: stack) { $0[index] }
        case let .array(expressions): try array(expressions, mount: mount, context: context, stack: stack)
        case let .object(expressions): try object(expressions, mount: mount, context: context, stack: stack)
        case let .call("Query", args): try query(args: args, mount: mount, context: context, stack: stack)
        case let .call("Each", args): try each(args, mount: mount, context: context, stack: stack)
        case let .call(name, args):
            if definitions[name] == nil, let template = templates[name] {
                try expand(template, args: args, mount: mount, context: context, stack: stack)
            } else {
                try element(name, args: args, mount: mount, context: context, stack: stack)
            }
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
        mount: String,
        context: Context,
        stack: Set<String>,
        read: (PValue) -> PValue?
    ) throws -> Evaluated {
        let parent = try evaluate(base, mount: mount, context: context, stack: stack)
        return .init(value: read(parent.value) ?? .null)
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
        return .init(value: dataset.result)
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
            child.aliases[alias] = .init(value: item)
            nodes += try evaluate(args[2], mount: mount + "/item:\(index)", context: child, stack: stack).nodes
        }
        return .init(nodes: nodes)
    }

    /// The template's body in a fresh scope: only its parameters are bound, so the caller's @Each
    /// items can't capture its own. It mounts where the call sits, so element ids match the
    /// expanded program's.
    private mutating func expand(
        _ template: CompiledTemplate,
        args: [OpenUIExpression],
        mount: String,
        context: Context,
        stack: Set<String>
    ) throws -> Evaluated {
        guard args.count <= template.params.count else { throw OpenUIError.syntax("Too many \(template.name) arguments") }
        var scope = Context()
        for (index, param) in template.params.enumerated() {
            let given = index < args
                .count ? try evaluate(args[index], mount: mount, context: context, stack: stack) : nil
            if let given, param.role == "data" || given.value != .null {
                scope.aliases[param.name] = given
            } else if let fallback = template.defaults[index] {
                scope.aliases[param.name] = try evaluate(fallback, mount: mount, context: scope, stack: stack)
            } else {
                scope.aliases[param.name] = .init()
            }
        }
        return try evaluate(template.body, mount: mount, context: scope, stack: stack)
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
            slots: [:]
        )
        for (index, spec) in definition.args.enumerated() {
            let isSlot = spec.role == "node" || spec.role == "nodes"
            if isSlot { element.slots[spec.name] = [] }
            guard index < args.count else { continue }
            let result = try evaluate(args[index], mount: mount + "/" + spec.name, context: context, stack: stack)
            if isSlot { element.slots[spec.name] = result.nodes } else { element.properties[spec.name] = result.value }
        }
        elements[id] = element
        return .init(nodes: [id])
    }
}
