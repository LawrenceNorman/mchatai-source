// BEGIN mChatAI macOS Component: cardgame.poker (components/card-game/PokerHandEvaluator.swift)
import Foundation

enum PokerHandRank: Int, Codable, Comparable, Sendable {
    case highCard = 1
    case pair
    case twoPair
    case threeOfAKind
    case straight
    case flush
    case fullHouse
    case fourOfAKind
    case straightFlush

    static func < (lhs: PokerHandRank, rhs: PokerHandRank) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

struct PokerEvaluation: Codable, Comparable, Sendable {
    let rank: PokerHandRank
    let kickers: [Int]

    static func < (lhs: PokerEvaluation, rhs: PokerEvaluation) -> Bool {
        if lhs.rank != rhs.rank { return lhs.rank < rhs.rank }
        return lhs.kickers.lexicographicallyPrecedes(rhs.kickers)
    }
}

enum PokerHandEvaluator {
    static func evaluate(_ cards: [PlayingCard]) -> PokerEvaluation {
        let combinations = fiveCardCombinations(cards)
        return combinations.map(evaluateFive).max() ?? PokerEvaluation(rank: .highCard, kickers: [])
    }

    static func evaluateFive(_ cards: [PlayingCard]) -> PokerEvaluation {
        let ranks = cards.map { $0.rank.rawValue }.sorted(by: >)
        let grouped = Dictionary(grouping: ranks, by: { $0 })
            .mapValues(\.count)
        let orderedGroups = grouped.sorted { lhs, rhs in
            lhs.value == rhs.value ? lhs.key > rhs.key : lhs.value > rhs.value
        }
        let isFlush = Set(cards.map(\.suit)).count == 1
        let straightHigh = straightHighCard(ranks)

        if isFlush, let straightHigh {
            return PokerEvaluation(rank: .straightFlush, kickers: [straightHigh])
        }
        if orderedGroups.first?.value == 4 {
            return PokerEvaluation(rank: .fourOfAKind, kickers: orderedGroups.map(\.key))
        }
        if orderedGroups.map(\.value) == [3, 2] {
            return PokerEvaluation(rank: .fullHouse, kickers: orderedGroups.map(\.key))
        }
        if isFlush {
            return PokerEvaluation(rank: .flush, kickers: ranks)
        }
        if let straightHigh {
            return PokerEvaluation(rank: .straight, kickers: [straightHigh])
        }
        if orderedGroups.first?.value == 3 {
            return PokerEvaluation(rank: .threeOfAKind, kickers: orderedGroups.map(\.key))
        }
        if orderedGroups.filter({ $0.value == 2 }).count == 2 {
            return PokerEvaluation(rank: .twoPair, kickers: orderedGroups.map(\.key))
        }
        if orderedGroups.first?.value == 2 {
            return PokerEvaluation(rank: .pair, kickers: orderedGroups.map(\.key))
        }
        return PokerEvaluation(rank: .highCard, kickers: ranks)
    }

    private static func fiveCardCombinations(_ cards: [PlayingCard]) -> [[PlayingCard]] {
        guard cards.count > 5 else { return [cards] }
        var result: [[PlayingCard]] = []
        for a in 0..<(cards.count - 4) {
            for b in (a + 1)..<(cards.count - 3) {
                for c in (b + 1)..<(cards.count - 2) {
                    for d in (c + 1)..<(cards.count - 1) {
                        for e in (d + 1)..<cards.count {
                            result.append([cards[a], cards[b], cards[c], cards[d], cards[e]])
                        }
                    }
                }
            }
        }
        return result
    }

    private static func straightHighCard(_ ranks: [Int]) -> Int? {
        let unique = Array(Set(ranks)).sorted(by: >)
        if unique == [14, 5, 4, 3, 2] { return 5 }
        guard unique.count == 5 else { return nil }
        return unique.first! - unique.last! == 4 ? unique.first : nil
    }
}
// END mChatAI macOS Component: cardgame.poker
