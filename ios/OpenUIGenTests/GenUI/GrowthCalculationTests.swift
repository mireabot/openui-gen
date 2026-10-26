import Foundation
import Testing
@testable import OpenUIGen

struct GrowthCalculationTests {
    private let seed: [String: PValue] = [
        "unitPrice": .number(125),
        "quantity": .number(20),
        "months": .number(12),
        "annualRate": .number(12),
    ]

    @Test func calculatesWholeUnitsAndAnnualCompounding() throws {
        let result = GrowthCalculation.evaluate(seed)
        #expect(result["startingValue"] == .number(2500))
        #expect(try abs(#require(result["endingValue"]?.numberValue) - 2800) < 1e-8)
        #expect(try abs(#require(result["change"]?.numberValue) - 300) < 1e-8)
        var changed = seed
        changed["quantity"] = .number(21)
        changed["months"] = .number(6)
        let ending = try #require(GrowthCalculation.evaluate(changed)["endingValue"]?.numberValue)
        #expect(abs(ending - 2625 * sqrt(1.12)) < 1e-8)
    }

    @Test func zeroAndLossAreLegitimateButMissingInputsAreUnavailable() {
        for (key, value) in [("quantity", PValue.number(0)), ("annualRate", .number(-100))] {
            var inputs = seed; inputs[key] = value
            #expect(GrowthCalculation.evaluate(inputs)["endingValue"] == .number(0))
        }
        let invalid: [(String, PValue)] = [
            ("quantity", .number(1.5)), ("quantity", .number(-1)), ("unitPrice", .number(0)), ("unitPrice", .null),
            ("months", .number(0)), ("annualRate", .number(-101)), ("unitPrice", .number(.infinity)),
        ]
        for (key, value) in invalid {
            var inputs = seed; inputs[key] = value
            #expect(GrowthCalculation.evaluate(inputs)["valid"] == .bool(false))
            #expect(GrowthCalculation.evaluate(inputs)["endingValue"] == .null)
        }
    }
}
