// BEGIN mChatAI macOS Component: wordgame.keyboard-handling (components/word-game/WordGameKeyboardHandling.swift)
import SwiftUI

struct WordGameKeyboardHandling: ViewModifier {
    let onLetter: (Character) -> Void
    let onDelete: () -> Void
    let onSubmit: () -> Void

    @FocusState private var isFocused: Bool

    func body(content: Content) -> some View {
        content
            .focusable()
            .focused($isFocused)
            .onAppear {
                isFocused = true
            }
            .onKeyPress(characters: .letters, phases: .down) { press in
                guard let first = press.characters.uppercased().first else {
                    return .ignored
                }
                onLetter(first)
                return .handled
            }
            .onKeyPress(.return, phases: .down) { _ in
                onSubmit()
                return .handled
            }
            .onKeyPress(.delete, phases: .down) { _ in
                onDelete()
                return .handled
            }
    }
}

extension View {
    func wordGameKeyboardHandling(
        onLetter: @escaping (Character) -> Void,
        onDelete: @escaping () -> Void,
        onSubmit: @escaping () -> Void
    ) -> some View {
        modifier(
            WordGameKeyboardHandling(
                onLetter: onLetter,
                onDelete: onDelete,
                onSubmit: onSubmit
            )
        )
    }
}
// END mChatAI macOS Component: wordgame.keyboard-handling
