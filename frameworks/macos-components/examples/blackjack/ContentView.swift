import SwiftUI

struct ContentView: View {
    @State private var engine = BlackjackEngine()
    @State private var selectedBet = 25

    private let betSteps = [10, 25, 50, 100]

    var body: some View {
        VStack(spacing: 18) {
            header
            table
            controls
        }
        .padding(24)
        .frame(minWidth: 820, minHeight: 600)
        .background(Color(red: 0.06, green: 0.12, blue: 0.09))
        .foregroundStyle(.white)
        .onAppear {
            print("[BlackjackExample] ready bankroll=\(engine.bankroll) phase=\(engine.phase.rawValue)")
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Native Blackjack")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(engine.status)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.72))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text("Bankroll")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.55))
                Text("$\(engine.bankroll)")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .monospacedDigit()
            }
        }
    }

    private var table: some View {
        VStack(spacing: 18) {
            handSection(
                title: "Dealer",
                cards: visibleDealerCards,
                value: dealerValueText,
                isDealer: true
            )

            Divider()
                .overlay(.white.opacity(0.18))

            handSection(
                title: "Player",
                cards: engine.player,
                value: "\(CardHandValue.blackjack(engine.player))",
                isDealer: false
            )
        }
        .padding(18)
        .background(Color.black.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(.white.opacity(0.16), lineWidth: 1)
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Picker("Bet", selection: $selectedBet) {
                ForEach(betSteps, id: \.self) { bet in
                    Text("$\(bet)").tag(bet)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 260)
            .disabled(engine.phase == .playerTurn || engine.phase == .dealerTurn)

            Button("Deal") {
                engine.deal(bet: selectedBet)
            }
            .keyboardShortcut(.return, modifiers: [])
            .disabled(engine.phase == .playerTurn || engine.phase == .dealerTurn || engine.bankroll <= 0)

            Button("Hit") {
                engine.hit()
            }
            .keyboardShortcut("h", modifiers: [])
            .disabled(engine.phase != .playerTurn)

            Button("Stand") {
                engine.stand()
            }
            .keyboardShortcut("s", modifiers: [])
            .disabled(engine.phase != .playerTurn)

            Spacer()

            Text("Return deal  H hit  S stand")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.55))
        }
        .buttonStyle(.borderedProminent)
    }

    private func handSection(title: String, cards: [PlayingCard], value: String, isDealer: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.title3.weight(.bold))
                Spacer()
                Text("Value \(value)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
            }

            HStack(spacing: 10) {
                ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
                    cardView(card)
                }
                if cards.isEmpty {
                    placeholderCards(count: isDealer ? 2 : 2)
                }
                Spacer(minLength: 0)
            }
            .frame(height: 122)
        }
    }

    private func cardView(_ card: PlayingCard) -> some View {
        VStack(alignment: .leading) {
            Text(rankLabel(card.rank))
                .font(.title2.weight(.black))
            Spacer()
            Text(suitLabel(card.suit))
                .font(.title.weight(.heavy))
            Spacer()
            Text(rankLabel(card.rank))
                .font(.title2.weight(.black))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .foregroundStyle(cardColor(card.suit))
        .padding(10)
        .frame(width: 78, height: 112)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.24), radius: 8, y: 3)
    }

    private func placeholderCards(count: Int) -> some View {
        ForEach(0..<count, id: \.self) { _ in
            RoundedRectangle(cornerRadius: 8)
                .fill(.white.opacity(0.12))
                .frame(width: 78, height: 112)
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.white.opacity(0.18), lineWidth: 1)
                }
        }
    }

    private var visibleDealerCards: [PlayingCard] {
        guard engine.phase == .playerTurn, let first = engine.dealer.first else {
            return engine.dealer
        }
        return [first]
    }

    private var dealerValueText: String {
        if engine.phase == .playerTurn {
            return visibleDealerCards.isEmpty ? "0" : "\(CardHandValue.blackjack(visibleDealerCards)) + hidden"
        }
        return "\(CardHandValue.blackjack(engine.dealer))"
    }

    private func rankLabel(_ rank: PlayingCardRank) -> String {
        switch rank {
        case .ace: return "A"
        case .king: return "K"
        case .queen: return "Q"
        case .jack: return "J"
        default: return "\(rank.rawValue)"
        }
    }

    private func suitLabel(_ suit: PlayingCardSuit) -> String {
        switch suit {
        case .clubs: return "♣"
        case .diamonds: return "♦"
        case .hearts: return "♥"
        case .spades: return "♠"
        }
    }

    private func cardColor(_ suit: PlayingCardSuit) -> Color {
        switch suit {
        case .diamonds, .hearts: return .red
        case .clubs, .spades: return .black
        }
    }
}
