import Foundation

/// Deterministic local math for the generic Calculation primitive. Inputs are assumptions.
public enum GrowthCalculation {
    public static func evaluate(_ record: [String: PValue], model: String = "compound-growth") -> [String: PValue] {
        var result = record.merging(outputs(record, model: model)) { _, new in new }
        if let options = record["alternatives"]?.listValue {
            result["alternatives"] = .list(options.map { raw in
                guard var option = raw.objectValue else { return raw }
                var inputs = record
                inputs["annualRate"] = option["value"]
                let values = outputs(inputs, model: model)
                option.merge(values) { _, new in new }
                option["detail"] = .string(values["endingValue"]?.numberValue
                    .map { "\(money($0)) ending value" } ?? "Unavailable")
                option["trailing"] = .string(values["change"]?.numberValue
                    .map { "\($0 > 0 ? "+" : "")\(money($0))" } ?? "—")
                return .object(option)
            })
        }
        return result
    }

    private static func outputs(_ inputs: [String: PValue], model: String) -> [String: PValue] {
        let missing: [String: PValue] = [
            "startingValue": .null, "endingValue": .null, "change": .null, "periodRate": .null,
            "endUnitPrice": .null, "valid": .bool(false), "changeInk": .string("secondary"),
        ]
        guard let price = inputs["unitPrice"]?.numberValue, price.isFinite, price > 0,
              let quantity = inputs["quantity"]?.numberValue, quantity.isFinite, quantity >= 0,
              quantity <= 9_007_199_254_740_991, quantity == quantity.rounded(),
              let months = inputs["months"]?.numberValue, months.isFinite, months > 0,
              let rate = inputs["annualRate"]?.numberValue, rate.isFinite, rate >= -100 else { return missing }
        let factor = model == "simple-growth" ? 1 + rate / 100 * months / 12 : pow(1 + rate / 100, months / 12)
        let start = price * quantity, ending = start * factor, unit = price * factor
        guard start.isFinite, factor.isFinite, factor >= 0, ending.isFinite, unit.isFinite else { return missing }
        let change = ending - start
        return [
            "startingValue": .number(start), "endingValue": .number(ending), "change": .number(change),
            "periodRate": .number((factor - 1) * 100), "endUnitPrice": .number(unit), "valid": .bool(true),
            "changeInk": .string(change < 0 ? "orange" : change > 0 ? "green" : "secondary"),
        ]
    }

    private static func money(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US")).precision(.fractionLength(2)))
    }
}
