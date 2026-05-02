import SwiftUI

struct ContentView: View {
    @State private var table = PokerTableState.newTournament()
    @State private var selectedRaise = 25

    private let raiseSteps = [10, 25, 50, 100]

    var body: some View {
        HStack(spacing: 18) {
            tableColumn
            sidePanel
        }
        .padding(18)
        .frame(minWidth: 1040, minHeight: 680)
        .background(Color(red: 0.07, green: 0.09, blue: 0.15))
        .foregroundStyle(.white)
        .onAppear {
            print("[PokerExample] ready players=\(table.activePlayerCount) pot=\(table.pot) phase=\(table.phase.title)")
        }
    }

    private var tableColumn: some View {
        VStack(spacing: 14) {
            header
            feltTable
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Native Hold'em Poker")
                    .font(.system(size: 32, weight: .black, design: .rounded))
                Text(table.status)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.72))
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(table.phase.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.yellow.opacity(0.9))
                Text("Pot $\(table.pot)")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .monospacedDigit()
            }
        }
    }

    private var feltTable: some View {
        GeometryReader { proxy in
            ZStack {
                RoundedRectangle(cornerRadius: 180)
                    .fill(
                        RadialGradient(
                            colors: [
                                Color(red: 0.07, green: 0.45, blue: 0.23),
                                Color(red: 0.03, green: 0.28, blue: 0.15),
                                Color(red: 0.02, green: 0.12, blue: 0.08)
                            ],
                            center: .center,
                            startRadius: 40,
                            endRadius: 420
                        )
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 180)
                            .stroke(Color(red: 0.37, green: 0.24, blue: 0.14), lineWidth: 14)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: 158)
                            .stroke(.white.opacity(0.12), lineWidth: 2)
                            .padding(24)
                    }
                    .shadow(color: .black.opacity(0.55), radius: 16, y: 8)

                centerCards

                ForEach(table.seats) { seat in
                    seatView(seat)
                        .position(tablePosition(for: seat.id, in: proxy.size))
                }
            }
        }
        .frame(minHeight: 560)
    }

    private var centerCards: some View {
        VStack(spacing: 12) {
            Text("Pot $\(table.pot)")
                .font(.title3.weight(.black))
                .monospacedDigit()
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(.black.opacity(0.32))
                .clipShape(Capsule())

            HStack(spacing: 8) {
                ForEach(Array(table.community.enumerated()), id: \.offset) { _, card in
                    cardView(card, compact: false)
                }
                ForEach(0..<max(0, 5 - table.community.count), id: \.self) { _ in
                    emptyCardSlot
                }
            }

            Text(table.centerHint)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(16)
        .background(.black.opacity(0.20))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var emptyCardSlot: some View {
        RoundedRectangle(cornerRadius: 7)
            .fill(.white.opacity(0.10))
            .frame(width: 60, height: 84)
            .overlay {
                RoundedRectangle(cornerRadius: 7)
                    .stroke(.white.opacity(0.16), lineWidth: 1)
            }
    }

    private func seatView(_ seat: PokerSeat) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                if seat.isDealer {
                    Text("D")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.black)
                        .frame(width: 21, height: 21)
                        .background(.white)
                        .clipShape(Circle())
                }

                VStack(spacing: 1) {
                    Text(seat.name)
                        .font(.caption.weight(.bold))
                    Text(seat.isOut ? "Out" : "$\(seat.chips)")
                        .font(.caption2.monospacedDigit().weight(.bold))
                        .foregroundStyle(seat.isOut ? .red.opacity(0.85) : .yellow.opacity(0.9))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .frame(width: 150)
            .background(seat.id == table.currentActorID ? .yellow.opacity(0.22) : .black.opacity(0.50))
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(seat.id == table.currentActorID ? .yellow.opacity(0.75) : .white.opacity(0.10), lineWidth: 1)
            }

            HStack(spacing: 5) {
                if seat.isOut {
                    Text("eliminated")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white.opacity(0.55))
                        .frame(width: 96, height: 56)
                } else if seat.cards.isEmpty {
                    ForEach(0..<2, id: \.self) { _ in
                        miniCardSlot
                    }
                } else {
                    ForEach(Array(seat.cards.enumerated()), id: \.offset) { _, card in
                        if seat.isHuman || table.phase == .showdown || table.handComplete {
                            cardView(card, compact: true)
                        } else if seat.folded {
                            miniCardSlot
                        } else {
                            cardBack(compact: true)
                        }
                    }
                }
            }

            if seat.currentBet > 0 {
                HStack(spacing: -5) {
                    chip(color: .red)
                    chip(color: .blue)
                    Text("$\(seat.currentBet)")
                        .font(.caption2.monospacedDigit().weight(.black))
                        .padding(.leading, 8)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(.black.opacity(0.36))
                .clipShape(Capsule())
            } else if seat.folded {
                Text("Folded")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white.opacity(0.55))
            }
        }
        .frame(width: 166, height: 136)
        .opacity(seat.isOut ? 0.42 : 1)
    }

    private var miniCardSlot: some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(.white.opacity(0.12))
            .frame(width: 45, height: 63)
            .overlay {
                RoundedRectangle(cornerRadius: 5)
                    .stroke(.white.opacity(0.16), lineWidth: 1)
            }
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Table")
                    .font(.title2.weight(.black))
                Text("You versus \(table.activeOpponentCount) CPU player\(table.activeOpponentCount == 1 ? "" : "s")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }

            chipSummary
            controls
            logView

            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(width: 300)
        .background(Color(red: 0.13, green: 0.18, blue: 0.24))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var chipSummary: some View {
        VStack(spacing: 8) {
            HStack {
                Label("Your stack", systemImage: "circle.grid.2x2.fill")
                Spacer()
                Text("$\(table.humanChips)")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
            HStack {
                Label("Remaining", systemImage: "person.3.fill")
                Spacer()
                Text("\(table.activePlayerCount)/5")
                    .monospacedDigit()
                    .fontWeight(.black)
            }
        }
        .font(.callout)
        .padding(12)
        .background(.black.opacity(0.22))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker("Raise", selection: $selectedRaise) {
                ForEach(raiseSteps, id: \.self) { amount in
                    Text("$\(amount)").tag(amount)
                }
            }
            .pickerStyle(.segmented)
            .disabled(!table.canAct)

            Button("Deal") {
                table.dealHand()
            }
            .keyboardShortcut(.return, modifiers: [])
            .disabled(!table.canDeal)

            HStack(spacing: 8) {
                Button("Fold") {
                    table.playerFold()
                }
                .keyboardShortcut("f", modifiers: [])
                .disabled(!table.canAct)

                Button(table.callTitle) {
                    table.playerCheckOrCall()
                }
                .keyboardShortcut("c", modifiers: [])
                .disabled(!table.canAct)
            }

            Button("Raise $\(selectedRaise)") {
                table.playerRaise(by: selectedRaise)
            }
            .keyboardShortcut("r", modifiers: [])
            .disabled(!table.canAct || table.humanChips <= table.amountToCall)

            if table.tournamentComplete {
                Button("New Tournament") {
                    table.resetTournament()
                }
            }

            Text("Return deal  F fold  C check/call  R raise")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.55))
        }
        .buttonStyle(.borderedProminent)
    }

    private var logView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Log")
                .font(.headline)
            ScrollView {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(Array(table.log.suffix(14).enumerated()), id: \.offset) { _, entry in
                        Text(entry)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.78))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(10)
            }
            .frame(minHeight: 170)
            .background(Color(red: 0.07, green: 0.09, blue: 0.15))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func cardView(_ card: PlayingCard, compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(rankLabel(card.rank))
                .font(compact ? .caption.weight(.black) : .title3.weight(.black))
            Spacer()
            Text(suitLabel(card.suit))
                .font(compact ? .title3.weight(.heavy) : .title.weight(.heavy))
                .frame(maxWidth: .infinity, alignment: .center)
            Spacer()
            Text(rankLabel(card.rank))
                .font(compact ? .caption.weight(.black) : .title3.weight(.black))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .foregroundStyle(cardColor(card.suit))
        .padding(compact ? 5 : 7)
        .frame(width: compact ? 45 : 60, height: compact ? 63 : 84)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: compact ? 5 : 7))
        .shadow(color: .black.opacity(0.22), radius: 4, y: 2)
    }

    private func cardBack(compact: Bool) -> some View {
        RoundedRectangle(cornerRadius: compact ? 5 : 7)
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 0.65, green: 0.05, blue: 0.06),
                        Color(red: 0.38, green: 0.01, blue: 0.03)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: compact ? 45 : 60, height: compact ? 63 : 84)
            .overlay {
                RoundedRectangle(cornerRadius: compact ? 5 : 7)
                    .stroke(.white.opacity(0.26), lineWidth: 1)
            }
            .overlay {
                Text("m")
                    .font(.system(size: compact ? 16 : 24, weight: .black, design: .rounded))
                    .foregroundStyle(.white.opacity(0.82))
            }
    }

    private func chip(color: Color) -> some View {
        Circle()
            .fill(color)
            .frame(width: 17, height: 17)
            .overlay {
                Circle()
                    .stroke(.white.opacity(0.82), lineWidth: 2)
            }
    }

    private func tablePosition(for seatID: Int, in size: CGSize) -> CGPoint {
        switch seatID {
        case 0: return CGPoint(x: size.width * 0.50, y: size.height * 0.82)
        case 1: return CGPoint(x: size.width * 0.13, y: size.height * 0.62)
        case 2: return CGPoint(x: size.width * 0.25, y: size.height * 0.20)
        case 3: return CGPoint(x: size.width * 0.75, y: size.height * 0.20)
        default: return CGPoint(x: size.width * 0.87, y: size.height * 0.62)
        }
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

private enum PokerPhase {
    case waiting
    case preflop
    case flop
    case turn
    case river
    case showdown

    var title: String {
        switch self {
        case .waiting: return "Ready"
        case .preflop: return "Pre-flop"
        case .flop: return "Flop"
        case .turn: return "Turn"
        case .river: return "River"
        case .showdown: return "Showdown"
        }
    }
}

private struct PokerSeat: Identifiable, Equatable {
    let id: Int
    var name: String
    var chips: Int
    var cards: [PlayingCard] = []
    var currentBet: Int = 0
    var folded = false
    var isOut = false
    var isDealer = false
    let isHuman: Bool
}

private struct PokerTableState {
    private static let startingChips = 500
    private static let smallBlind = 10
    private static let bigBlind = 20

    var seats: [PokerSeat]
    var deck = CardDeck(seed: 6001)
    var community: [PlayingCard] = []
    var pot = 0
    var currentBet = 0
    var phase: PokerPhase = .waiting
    var dealerID = 4
    var currentActorID: Int?
    var handNumber = 0
    var status = "Press Deal to start a five-player table."
    var log: [String] = ["Tournament ready: You vs CPU 1-4."]
    var handComplete = true
    var tournamentComplete = false

    static func newTournament() -> PokerTableState {
        PokerTableState(seats: [
            PokerSeat(id: 0, name: "You", chips: startingChips, isHuman: true),
            PokerSeat(id: 1, name: "CPU 1", chips: startingChips, isHuman: false),
            PokerSeat(id: 2, name: "CPU 2", chips: startingChips, isHuman: false),
            PokerSeat(id: 3, name: "CPU 3", chips: startingChips, isHuman: false),
            PokerSeat(id: 4, name: "CPU 4", chips: startingChips, isHuman: false)
        ])
    }

    var humanChips: Int { seats.first(where: \.isHuman)?.chips ?? 0 }
    var activePlayerCount: Int { seats.filter { !$0.isOut }.count }
    var activeOpponentCount: Int { seats.filter { !$0.isOut && !$0.isHuman }.count }
    var canDeal: Bool { handComplete || phase == .waiting || tournamentComplete }
    var canAct: Bool { !handComplete && !tournamentComplete && phase != .showdown && !(seats.first(where: \.isHuman)?.folded ?? true) }
    var amountToCall: Int {
        guard let humanIndex = seats.firstIndex(where: \.isHuman) else { return 0 }
        return max(0, currentBet - seats[humanIndex].currentBet)
    }
    var callTitle: String { amountToCall > 0 ? "Call $\(amountToCall)" : "Check" }
    var centerHint: String {
        if phase == .waiting { return "Deal starts blinds and hole cards" }
        if phase == .showdown { return "Showdown complete. Deal the next hand." }
        return "\(phase.title): \(community.count)/5 community cards"
    }

    mutating func resetTournament() {
        self = Self.newTournament()
        appendLog("New tournament: five seats, $\(Self.startingChips) each.")
    }

    mutating func dealHand() {
        if tournamentComplete {
            resetTournament()
        }

        markBustedSeats()
        guard activePlayerCount > 1, humanChips > 0 else {
            tournamentComplete = true
            handComplete = true
            phase = .showdown
            status = humanChips > 0 ? "Tournament won." : "You are out. Start a new tournament."
            appendLog(status)
            return
        }

        handNumber += 1
        deck = CardDeck(seed: UInt64(6001 + handNumber * 31))
        community = []
        pot = 0
        currentBet = 0
        phase = .preflop
        handComplete = false
        tournamentComplete = false

        for index in seats.indices {
            seats[index].cards = []
            seats[index].currentBet = 0
            seats[index].folded = false
            seats[index].isDealer = false
        }

        if let nextDealer = nextActiveID(after: dealerID) {
            dealerID = nextDealer
        }
        if let dealerIndex = index(for: dealerID) {
            seats[dealerIndex].isDealer = true
        }

        let activeIDs = activeSeatIDs(startingAfter: dealerID)
        for _ in 0..<2 {
            for id in activeIDs {
                guard let index = index(for: id), !seats[index].isOut else { continue }
                seats[index].cards.append(contentsOf: deck.draw(1))
            }
        }

        if let smallBlindID = nextActiveID(after: dealerID),
           let bigBlindID = nextActiveID(after: smallBlindID),
           let smallIndex = index(for: smallBlindID),
           let bigIndex = index(for: bigBlindID) {
            let small = charge(Self.smallBlind, from: smallIndex)
            let big = charge(Self.bigBlind, from: bigIndex)
            currentBet = max(small, big)
            appendLog("\(seats[smallIndex].name) posts small blind $\(small).")
            appendLog("\(seats[bigIndex].name) posts big blind $\(big).")
        }

        currentActorID = 0
        status = "Hand \(handNumber): your move against \(activeOpponentCount) CPU players."
        appendLog("--- Hand \(handNumber) ---")
        appendLog("\(seats[index(for: dealerID) ?? 0].name) has the dealer button.")
    }

    mutating func playerFold() {
        guard canAct, let humanIndex = seats.firstIndex(where: \.isHuman) else { return }
        seats[humanIndex].folded = true
        appendLog("You fold.")
        dealRemainingCommunity()
        settleShowdown()
    }

    mutating func playerCheckOrCall() {
        guard canAct, let humanIndex = seats.firstIndex(where: \.isHuman) else { return }
        let call = amountToCall
        if call > 0 {
            let paid = charge(call, from: humanIndex)
            appendLog("You call $\(paid).")
        } else {
            appendLog("You check.")
        }
        runCPUResponses()
        advanceAfterBettingRound()
    }

    mutating func playerRaise(by raise: Int) {
        guard canAct, let humanIndex = seats.firstIndex(where: \.isHuman) else { return }
        let call = amountToCall
        let desired = max(Self.bigBlind, raise)
        let paid = charge(call + desired, from: humanIndex)
        currentBet = max(currentBet, seats[humanIndex].currentBet)
        appendLog("You raise to $\(seats[humanIndex].currentBet) with $\(paid) in this action.")
        runCPUResponses()
        advanceAfterBettingRound()
    }

    private mutating func runCPUResponses() {
        for index in seats.indices where !seats[index].isHuman && !seats[index].isOut && !seats[index].folded {
            let toCall = max(0, currentBet - seats[index].currentBet)
            let strength = estimatedStrength(for: seats[index])
            let pressure = toCall > max(Self.bigBlind, pot / max(4, activePlayerCount))

            if toCall > 0 && strength < 3 && pressure {
                seats[index].folded = true
                appendLog("\(seats[index].name) folds.")
            } else if toCall > 0 {
                let paid = charge(toCall, from: index)
                appendLog("\(seats[index].name) calls $\(paid).")
            } else {
                appendLog("\(seats[index].name) checks.")
            }
        }
    }

    private mutating func advanceAfterBettingRound() {
        if activeContenderIndices.count <= 1 {
            settleShowdown()
            return
        }

        for index in seats.indices {
            seats[index].currentBet = 0
        }
        currentBet = 0

        switch phase {
        case .waiting:
            break
        case .preflop:
            community.append(contentsOf: deck.draw(3))
            phase = .flop
            status = "Flop is out. \(humanHandSummary)"
            appendLog("--- Flop ---")
        case .flop:
            community.append(contentsOf: deck.draw(1))
            phase = .turn
            status = "Turn card is out. \(humanHandSummary)"
            appendLog("--- Turn ---")
        case .turn:
            community.append(contentsOf: deck.draw(1))
            phase = .river
            status = "River card is out. \(humanHandSummary)"
            appendLog("--- River ---")
        case .river:
            settleShowdown()
        case .showdown:
            break
        }
        currentActorID = canAct ? 0 : nil
    }

    private mutating func settleShowdown() {
        dealRemainingCommunity()
        phase = .showdown
        handComplete = true
        currentActorID = nil

        let contenders = activeContenderIndices
        guard !contenders.isEmpty else {
            status = "No active players."
            appendLog(status)
            return
        }

        if contenders.count == 1 {
            awardPot(to: contenders)
            return
        }

        let evaluations = contenders.map { index in
            (index: index, evaluation: PokerHandEvaluator.evaluate(seats[index].cards + community))
        }
        guard let best = evaluations.max(by: { $0.evaluation < $1.evaluation }) else { return }
        let winners = evaluations
            .filter { $0.evaluation == best.evaluation }
            .map(\.index)

        for item in evaluations {
            appendLog("\(seats[item.index].name): \(rankText(item.evaluation)).")
        }
        awardPot(to: winners)
    }

    private mutating func awardPot(to winnerIndices: [Int]) {
        guard !winnerIndices.isEmpty else { return }
        let split = pot / winnerIndices.count
        let remainder = pot - (split * winnerIndices.count)
        for (offset, index) in winnerIndices.enumerated() {
            seats[index].chips += split + (offset == 0 ? remainder : 0)
        }

        let names = winnerIndices.map { seats[$0].name }.joined(separator: " and ")
        status = winnerIndices.count == 1 ? "\(names) wins $\(pot)." : "\(names) split $\(pot)."
        appendLog(status)
        pot = 0
        markBustedSeats()

        if activePlayerCount <= 1 || humanChips <= 0 {
            tournamentComplete = true
            if humanChips > 0 && activeOpponentCount == 0 {
                status = "You win the tournament."
                appendLog(status)
            } else if humanChips <= 0 {
                status = "You are out. Start a new tournament."
                appendLog(status)
            }
        } else {
            appendLog("\(activeOpponentCount) CPU opponent\(activeOpponentCount == 1 ? "" : "s") remain.")
        }
    }

    private mutating func dealRemainingCommunity() {
        if community.count < 5 {
            community.append(contentsOf: deck.draw(5 - community.count))
        }
    }

    private mutating func markBustedSeats() {
        for index in seats.indices where seats[index].chips <= 0 && !seats[index].isOut {
            seats[index].isOut = true
            seats[index].folded = true
            appendLog("\(seats[index].name) is eliminated.")
        }
    }

    @discardableResult
    private mutating func charge(_ amount: Int, from index: Int) -> Int {
        let paid = min(max(0, amount), seats[index].chips)
        seats[index].chips -= paid
        seats[index].currentBet += paid
        pot += paid
        return paid
    }

    private var activeContenderIndices: [Int] {
        seats.indices.filter { !seats[$0].isOut && !seats[$0].folded }
    }

    private var humanHandSummary: String {
        guard let human = seats.first(where: \.isHuman), community.count >= 3 else { return "Waiting for board." }
        return rankText(PokerHandEvaluator.evaluate(human.cards + community))
    }

    private func estimatedStrength(for seat: PokerSeat) -> Int {
        if community.count >= 3 {
            return PokerHandEvaluator.evaluate(seat.cards + community).rank.rawValue
        }
        guard seat.cards.count == 2 else { return 1 }
        let first = seat.cards[0]
        let second = seat.cards[1]
        if first.rank == second.rank { return first.rank.rawValue >= 10 ? 5 : 4 }
        let high = max(first.rank.rawValue, second.rank.rawValue)
        let suitedBonus = first.suit == second.suit ? 1 : 0
        return max(1, min(5, (high / 4) + suitedBonus))
    }

    private func activeSeatIDs(startingAfter id: Int) -> [Int] {
        let active = seats.filter { !$0.isOut }.map(\.id).sorted()
        guard !active.isEmpty else { return [] }
        let after = active.filter { $0 > id }
        let before = active.filter { $0 <= id }
        return after + before
    }

    private func nextActiveID(after id: Int) -> Int? {
        activeSeatIDs(startingAfter: id).first
    }

    private func index(for id: Int) -> Int? {
        seats.firstIndex { $0.id == id }
    }

    private mutating func appendLog(_ message: String) {
        log.append(message)
        if log.count > 40 {
            log.removeFirst(log.count - 40)
        }
    }

    private func rankText(_ evaluation: PokerEvaluation) -> String {
        switch evaluation.rank {
        case .highCard: return "High card"
        case .pair: return "Pair"
        case .twoPair: return "Two pair"
        case .threeOfAKind: return "Three of a kind"
        case .straight: return "Straight"
        case .flush: return "Flush"
        case .fullHouse: return "Full house"
        case .fourOfAKind: return "Four of a kind"
        case .straightFlush: return "Straight flush"
        }
    }
}
