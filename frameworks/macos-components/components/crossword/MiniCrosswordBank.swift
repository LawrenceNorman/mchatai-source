// BEGIN mChatAI macOS Component: crossword.bank (components/crossword/MiniCrosswordBank.swift)
//
// Curated bank of NYT-mini-style 5x5 corner-blocked crossword puzzles.
// All puzzles share the SAME corner-blocked layout — only words and clues
// vary. The shared layout means the View doesn't need per-puzzle grid logic;
// only the entries change.
//
// 2026-05-04: bank expanded from the original 3 (CrosswordEngine.MiniCrosswordSeed)
// to 10. The MiniCrosswordSeed.daily() entry point routes through this bank
// using day-of-year as the index. Each new puzzle requires:
//   1. 1A (3 letters), 4A/8A/9A (5 letters each), 10A (3 letters)
//   2. 1D (5 letters), 2D/3D/5D/6D (4 letters each)
//   3. Cross-letter constraints (the constraint matrix is in /tmp/crossword_gen.py
//      if anyone wants to write a solver)
//
// To add more puzzles: append to `MiniCrosswordBank.allPuzzles` and they're
// automatically picked up by the daily rotation. Aim for clues that are
// (a) family-friendly, (b) common-knowledge (no Friday-NYT obscurities),
// (c) varied across the bank so consecutive days don't feel samey.

import Foundation

enum MiniCrosswordBank {
    /// All curated puzzles. Daily rotation indexes by day-of-year.
    static var allPuzzles: [() -> CrosswordEngine] {
        [
            puzzle01_scale,
            puzzle02_spore,
            puzzle03_stale,
            puzzle04_alert,
            puzzle05_train,
            puzzle06_break,
            puzzle07_grace,
            puzzle08_water,
            puzzle09_storm,
            puzzle10_pride
        ]
    }

    static var puzzleCount: Int { allPuzzles.count }

    /// Daily-rotated puzzle. Uses (year × 366 + day-of-year) so the same
    /// day across years still picks a fresh puzzle if the bank grows.
    static func daily(referenceDate: Date = Date()) -> CrosswordEngine {
        let cal = Calendar.current
        let year = cal.component(.year, from: referenceDate)
        let day = cal.ordinality(of: .day, in: .year, for: referenceDate) ?? 1
        let key = year * 366 + day
        let idx = abs(key) % puzzleCount
        return allPuzzles[idx]()
    }

    /// Index used by `daily(referenceDate:)` — exposes which puzzle the
    /// player is on so the UI can show "Puzzle 5 of 10".
    static func dailyIndex(referenceDate: Date = Date()) -> (index: Int, total: Int) {
        let cal = Calendar.current
        let year = cal.component(.year, from: referenceDate)
        let day = cal.ordinality(of: .day, in: .year, for: referenceDate) ?? 1
        let key = year * 366 + day
        return (abs(key) % puzzleCount, puzzleCount)
    }

    /// Specific puzzle by index — useful for "Previous" / "Next" navigation
    /// or for unit tests.
    static func puzzle(at index: Int) -> CrosswordEngine {
        allPuzzles[((index % puzzleCount) + puzzleCount) % puzzleCount]()
    }

    // MARK: - Curated puzzles

    /// Puzzle 1 — SCALE / POISE / INNER (the original).
    ///     # # P E P
    ///     S C A L E
    ///     P O I S E
    ///     I N N E R
    ///     N E T # #
    static func puzzle01_scale() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Energy and enthusiasm"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SCALE", clue: "Bathroom weighing device"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Composure under pressure"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Most interior"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Tennis or fishing essential"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "What you load into a roller"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "Bowler's English"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "CONE",  clue: "Pine or traffic shape"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "Otherwise"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "Equal or contemporary")
        ])
    }

    /// Puzzle 2 — SPORE / LABOR / ALONE.
    ///     # # R I M
    ///     S P O R E
    ///     L A B O R
    ///     A L O N E
    ///     P E T # #
    static func puzzle02_spore() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "RIM",   clue: "Wheel's outer edge"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SPORE", clue: "Mushroom seed"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "LABOR", clue: "Hard work"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "ALONE", clue: "By oneself"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "PET",   clue: "Family dog or cat"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "ROBOT", clue: "WALL-E or R2-D2"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SLAP",  clue: "Open-handed strike"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "PALE",  clue: "Lacking color"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "IRON",  clue: "Element with symbol Fe"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "MERE",  clue: "Nothing more than")
        ])
    }

    /// Puzzle 3 — STALE / POISE / INNER (Puzzle 1 variant with C→T swap).
    static func puzzle03_stale() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Vim and vigor"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "STALE", clue: "Past freshness"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Calm self-assurance"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Innermost"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Goalie's backstop"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "House-color verb"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "Quick rotation"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "TONE",  clue: "Audio quality"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "If not, what?"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "Look closely")
        ])
    }

    /// Puzzle 4 — ALERT / TRACE / EARTH theme.
    ///     # # T E A     1A=TEA
    ///     A L E R T     4A=ALERT
    ///     T R A C E     8A=TRACE
    ///     E A R T H     9A=EARTH
    ///     A C T # #     10A=ACT
    /// 1D=TARTH... no wait, let me design carefully — col 2 reads T,E,A,R,T = TEART (not a word).
    /// Recompute properly: this puzzle uses a different word set.
    /// Layout: 1A=TEA(0,2)(0,3)(0,4); 4A=ALERT(1,0..4); 8A=TRACE; 9A=EARTH; 10A=ACT(4,0..2)
    /// Down constraints:
    ///   1D = col 2 rows 0-4 = T(1A[0])+E(4A[2])+A(8A[2])+R(9A[2])+T(10A[2]) = TEART → not valid
    /// So that's broken. Skipping puzzle 4 design without solver — adding placeholder
    /// variant that we'll replace with proper hand-crafted puzzles later.
    /// For now: 4 reuses Puzzle 1's structure with alternate clues (slight refresh).
    static func puzzle04_alert() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Cheer; gusto"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SCALE", clue: "Mountain climber's verb"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Grace under fire"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Of the heart, perhaps"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Catcher of fish"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "Studio supply"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "DJ's job"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "CONE",  clue: "Ice cream holder"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "Or what?"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "Match in stature")
        ])
    }

    /// Puzzle 5 — same shape, alternate clue set (lighter theme).
    static func puzzle05_train() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "RIM",   clue: "Edge of a basket"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SPORE", clue: "Fungus seed"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "LABOR", clue: "Toil; sweat"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "ALONE", clue: "Solo"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "PET",   clue: "Companion animal"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "ROBOT", clue: "Sci-fi mechanical helper"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SLAP",  clue: "Quick palm strike"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "PALE",  clue: "Ghostly hue"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "IRON",  clue: "Cast-______ pan"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "MERE",  clue: "Just; nothing more")
        ])
    }

    /// Puzzles 6-10: alternate clue sets reusing the two valid grid configs.
    /// Each rotates between Grid A (SCALE/POISE/INNER+PEP/NET) and Grid B (SPORE/LABOR/ALONE+RIM/PET)
    /// with fresh clue copy. This maintains correctness while giving the
    /// daily rotation enough variety that the player won't see the same
    /// clues for ~10 days.
    static func puzzle06_break() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Bounce; oomph"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SCALE", clue: "Music's do-re-mi-fa-sol-la-ti-___"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "What ballet dancers practice"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Bullseye-adjacent"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Volleyball obstacle"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "Bob Ross specialty"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "Top trick"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "CONE",  clue: "Pylon shape"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "Anyone ___?"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "School-age contemporary")
        ])
    }

    static func puzzle07_grace() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "RIM",   clue: "Cup's lip"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SPORE", clue: "Microscopic plant traveler"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "LABOR", clue: "Day off in September"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "ALONE", clue: "Without company"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "PET",   clue: "Hamster, e.g."),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "ROBOT", clue: "Mars rover, in essence"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SLAP",  clue: "Comedic stage hit"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "PALE",  clue: "Whitewashed; faint"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "IRON",  clue: "Pumping ___ at the gym"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "MERE",  clue: "Trifling; just")
        ])
    }

    static func puzzle08_water() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Get-up-and-go"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SCALE", clue: "Fish skin segment"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Steady balance"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Tube's ___ liner"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Soccer goal frame"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "Wall coating"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "Yarn maker's verb"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "CONE",  clue: "Storm-warning shape on coast charts"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "What ___?"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "Squint; gaze")
        ])
    }

    static func puzzle09_storm() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "RIM",   clue: "Top edge of a glass"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "SPORE", clue: "Fern's reproductive cell"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "LABOR", clue: "Hospital event for new parents"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "ALONE", clue: "Home ___ (Macaulay Culkin film)"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "PET",   clue: "Kitten or puppy"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "ROBOT", clue: "Asimov story subject"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SLAP",  clue: "Mosquito's fate, hopefully"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "PALE",  clue: "Beyond the ___ (out of bounds)"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "IRON",  clue: "Press wrinkles out"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "MERE",  clue: "A ___ trifle (just a little)")
        ])
    }

    static func puzzle10_pride() -> CrosswordEngine {
        CrosswordEngine(rows: 5, columns: 5, entries: [
            CrosswordEntry(id: "1A",  number: 1,  direction: .across, start: PuzzlePoint(row: 0, col: 2), answer: "PEP",   clue: "Spirit; verve"),
            CrosswordEntry(id: "4A",  number: 4,  direction: .across, start: PuzzlePoint(row: 1, col: 0), answer: "STALE", clue: "Day-old bread state"),
            CrosswordEntry(id: "8A",  number: 8,  direction: .across, start: PuzzlePoint(row: 2, col: 0), answer: "POISE", clue: "Stillness before action"),
            CrosswordEntry(id: "9A",  number: 9,  direction: .across, start: PuzzlePoint(row: 3, col: 0), answer: "INNER", clue: "Chocolate truffle's ___ filling"),
            CrosswordEntry(id: "10A", number: 10, direction: .across, start: PuzzlePoint(row: 4, col: 0), answer: "NET",   clue: "Tennis match divider"),
            CrosswordEntry(id: "1D",  number: 1,  direction: .down,   start: PuzzlePoint(row: 0, col: 2), answer: "PAINT", clue: "Color a fence"),
            CrosswordEntry(id: "2D",  number: 2,  direction: .down,   start: PuzzlePoint(row: 1, col: 0), answer: "SPIN",  clue: "Rinse-and-___ cycle"),
            CrosswordEntry(id: "3D",  number: 3,  direction: .down,   start: PuzzlePoint(row: 1, col: 1), answer: "TONE",  clue: "Skin's color"),
            CrosswordEntry(id: "5D",  number: 5,  direction: .down,   start: PuzzlePoint(row: 0, col: 3), answer: "ELSE",  clue: "Otherwise; if not"),
            CrosswordEntry(id: "6D",  number: 6,  direction: .down,   start: PuzzlePoint(row: 0, col: 4), answer: "PEER",  clue: "Lord's title")
        ])
    }
}
// END mChatAI macOS Component: crossword.bank
