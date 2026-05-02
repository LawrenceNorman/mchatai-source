// BEGIN mChatAI macOS Component: cardgame.smoke-tests (components/card-game/CardGameSmokeTests.swift)
import Foundation

enum CardGameSmokeTests {
    static func launchReport() -> String {
        var deck = CardDeck(seed: 21)
        let draw = deck.draw(3)
        let softHand = [
            PlayingCard(suit: .spades, rank: .ace),
            PlayingCard(suit: .hearts, rank: .six),
            PlayingCard(suit: .clubs, rank: .nine)
        ]
        let value = CardHandValue.blackjack(softHand)

        return [
            "[CardGameSmoke] deck draw=\(draw.count) remaining=\(deck.remaining)",
            "[CardGameSmoke] blackjackValue=\(value)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: cardgame.smoke-tests
