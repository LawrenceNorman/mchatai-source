// BEGIN mChatAI macOS Component: desktopshell.mini-header (components/desktop-shell/MacOSMiniHeader.swift)
import SwiftUI

/// Compact native equivalent of the web `ui/MiniHeader` Lego.
/// Total height target: <=44pt regular width, <=32pt narrow width (matches wisdom u-022).
/// Title-only by default; subtitle is optional and hides at narrow widths.
struct MacOSMiniHeader: View {
    let title: String
    var subtitle: String? = nil

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        let isNarrow = horizontalSizeClass == .compact
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.system(size: isNarrow ? 15 : 18, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if let subtitle, !subtitle.isEmpty, !isNarrow {
                Text(subtitle)
                    .font(.system(size: 11, weight: .regular, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(maxHeight: isNarrow ? 32 : 44)
    }
}
// END mChatAI macOS Component: desktopshell.mini-header
