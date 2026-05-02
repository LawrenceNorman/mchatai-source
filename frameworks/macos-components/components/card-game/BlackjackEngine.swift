// BEGIN mChatAI macOS Component: cardgame.blackjack (components/card-game/BlackjackEngine.swift)
import Foundation

enum BlackjackPhase: String, Codable, Sendable {
    case betting
    case playerTurn
    case dealerTurn
    case settled
}

struct BlackjackEngine: Codable, Equatable, Sendable {
    private(set) var deck = CardDeck()
    private(set) var player: [PlayingCard] = []
    private(set) var dealer: [PlayingCard] = []
    private(set) var bankroll = 500
    private(set) var bet = 25
    private(set) var phase: BlackjackPhase = .betting
    private(set) var status = "Place your bet."

    mutating func deal(bet: Int = 25) {
        if deck.remaining < 16 { deck = CardDeck() }
        self.bet = max(1, min(bankroll, bet))
        bankroll -= self.bet
        player = deck.draw(2)
        dealer = deck.draw(2)
        phase = .playerTurn
        status = "Hit or stand."
        if CardHandValue.blackjack(player) == 21 {
            stand()
        }
    }

    mutating func hit() {
        guard phase == .playerTurn else { return }
        player.append(contentsOf: deck.draw())
        if CardHandValue.blackjack(player) > 21 {
            phase = .settled
            status = "Bust. Dealer wins."
        }
    }

    mutating func stand() {
        guard phase == .playerTurn || phase == .dealerTurn else { return }
        phase = .dealerTurn
        while CardHandValue.blackjack(dealer) < 17 {
            dealer.append(contentsOf: deck.draw())
        }
        settle()
    }

    mutating func settle() {
        let playerValue = CardHandValue.blackjack(player)
        let dealerValue = CardHandValue.blackjack(dealer)
        phase = .settled

        if playerValue > 21 {
            status = "Bust. Dealer wins."
        } else if dealerValue > 21 || playerValue > dealerValue {
            bankroll += bet * 2
            status = "You win."
        } else if playerValue == dealerValue {
            bankroll += bet
            status = "Push."
        } else {
            status = "Dealer wins."
        }
    }
}
// END mChatAI macOS Component: cardgame.blackjack
