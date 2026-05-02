// BEGIN mChatAI macOS Component: cardgame.core (components/card-game/CardGameCore.swift)
import Foundation

enum PlayingCardSuit: String, Codable, CaseIterable, Sendable {
    case clubs
    case diamonds
    case hearts
    case spades
}

enum PlayingCardRank: Int, Codable, CaseIterable, Comparable, Sendable {
    case two = 2
    case three = 3
    case four = 4
    case five = 5
    case six = 6
    case seven = 7
    case eight = 8
    case nine = 9
    case ten = 10
    case jack = 11
    case queen = 12
    case king = 13
    case ace = 14

    static func < (lhs: PlayingCardRank, rhs: PlayingCardRank) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

struct PlayingCard: Codable, Identifiable, Hashable, Sendable {
    let suit: PlayingCardSuit
    let rank: PlayingCardRank

    var id: String { "\(rank.rawValue)-\(suit.rawValue)" }

    var blackjackValue: Int {
        switch rank {
        case .jack, .queen, .king: return 10
        case .ace: return 11
        default: return rank.rawValue
        }
    }
}

struct CardDeck: Codable, Equatable, Sendable {
    private(set) var cards: [PlayingCard]
    private var seed: UInt64

    init(seed: UInt64 = 52) {
        self.seed = seed
        self.cards = PlayingCardSuit.allCases.flatMap { suit in
            PlayingCardRank.allCases.map { rank in PlayingCard(suit: suit, rank: rank) }
        }
        shuffle()
    }

    var remaining: Int { cards.count }

    mutating func shuffle() {
        var rng = SeededRandomNumberGenerator(seed: seed)
        cards.shuffle(using: &rng)
        seed = rng.next()
    }

    mutating func draw(_ count: Int = 1) -> [PlayingCard] {
        let drawn = Array(cards.prefix(max(0, count)))
        cards.removeFirst(min(count, cards.count))
        return drawn
    }
}

enum CardHandValue {
    static func blackjack(_ cards: [PlayingCard]) -> Int {
        var total = cards.reduce(0) { $0 + $1.blackjackValue }
        var aces = cards.filter { $0.rank == .ace }.count
        while total > 21 && aces > 0 {
            total -= 10
            aces -= 1
        }
        return total
    }
}
// END mChatAI macOS Component: cardgame.core
