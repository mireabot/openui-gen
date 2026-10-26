import Foundation
import Testing
@testable import OpenUIGen

struct NumberFormatTests {
    static let us = Locale(identifier: "en_US")

    struct Case: Sendable, CustomTestStringConvertible {
        let format: PrimitiveNumberFormat.Kind
        let value: Double
        var compact = false
        var signed = false
        var suffix: String?
        let expected: String

        var testDescription: String {
            "\(format) \(value) → \(expected)"
        }
    }

    @Test(arguments: [
        Case(format: .currency, value: 369.83, expected: "$369.83"),
        Case(format: .currency, value: 6000, expected: "$6,000"),
        Case(format: .currency, value: -42.5, expected: "−$42.50"),
        Case(format: .currency, value: 10_700_000_000, compact: true, expected: "$10.7B"),
        Case(format: .currency, value: 4500, compact: true, expected: "$4.5K"),
        Case(format: .integer, value: 1234.6, expected: "1,235"),
        Case(format: .integer, value: 12345, compact: true, expected: "12.3K"),
        Case(format: .decimal, value: 3.14159, expected: "3.14"),
        Case(format: .decimal, value: 2.5, signed: true, expected: "+2.5"),
        Case(format: .decimal, value: 0, signed: true, expected: "0"),
        Case(format: .percent, value: 42, expected: "42%"),
        Case(format: .percent, value: -3.4, signed: true, expected: "−3.4%"),
        Case(format: .percent, value: 2.873734, expected: "2.87%"),
        Case(format: .count, value: 1520, expected: "1.5K"),
        Case(format: .duration, value: 35, expected: "35 min"),
        Case(format: .distance, value: 5.25, expected: "5.25 km"),
        Case(format: .energy, value: 420, expected: "420 kcal"),
        Case(format: .mass, value: 12.5, expected: "12.5 g"),
        Case(format: .decimal, value: 4.2, suffix: " pts", expected: "4.2 pts"),
        Case(format: .duration, value: 90, suffix: "s", expected: "90s"),
    ])
    func formats(_ test: Case) {
        let format = PrimitiveNumberFormat(
            kind: test.format,
            compact: test.compact,
            signed: test.signed,
            suffix: test.suffix
        )
        #expect(format.string(test.value, locale: Self.us) == test.expected)
    }

    @Test func unknownFormatIsDecimalAndNonFiniteIsADash() {
        let format = PrimitiveNumberFormat(format: "bogus", compact: false, signed: false, suffix: nil)
        #expect(format.kind == .decimal)
        #expect(format.string(.nan, locale: Self.us) == "—")
    }
}
