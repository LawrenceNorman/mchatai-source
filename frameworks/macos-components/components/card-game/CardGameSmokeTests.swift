// BEGIN mChatAI macOS Component: cardgame.smoke-tests (components/card-game/CardGameSmokeTests.swift)
import Foundation

enum CardGameSmokeTests {
    static func launchReport() -> String {
        var blackjack = BlackjackEngine()
        blackjack.deal(bet: 25)
        blackjack.stand()

        let royal = [
            PlayingCard(suit: .spades, rank: .ten),
            PlayingCard(suit: .spades, rank: .jack),
            PlayingCard(suit: .spades, rank: .queen),
            PlayingCard(suit: .spades, rank: .king),
            PlayingCard(suit: .spades, rank: .ace)
        ]
        let poker = PokerHandEvaluator.evaluate(royal)

        return [
            "[CardGameSmoke] blackjack bankroll=\(blackjack.bankroll) status=\(blackjack.status)",
            "[CardGameSmoke] poker rank=\(poker.rank)"
        ].joined(separator: "\n")
    }

    static func printLaunchReport() {
        print(launchReport())
    }
}
// END mChatAI macOS Component: cardgame.smoke-tests
