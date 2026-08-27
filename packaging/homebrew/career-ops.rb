# Homebrew cask for CareerOps Desktop.
# This template is updated by the release workflow.
# Tap repository variable: HOMEBREW_TAP_REPO
cask "career-ops" do
  version "0.1.0"
  sha256 "RELEASE_SHA256_PLACEHOLDER"

  # The download URL is derived from .fork/release.json at release time.
  # Replace FORK_OWNER with the actual GitHub owner when the fork repo is created.
  url "https://github.com/FORK_OWNER/career-ops/releases/download/desktop-v#{version}/CareerOps_#{version}_macOS.dmg"
  name "CareerOps"
  desc "AI-powered job search pipeline — native desktop app"
  homepage "https://github.com/FORK_OWNER/career-ops"

  livecheck do
    url :url
    strategy :github_latest
    regex(/desktop[._-]v?(\d+(?:\.\d+)+)/i)
  end

  app "CareerOps.app"

  zap trash: [
    "~/Library/Application Support/io.career-ops.desktop",
    "~/Library/Caches/io.career-ops.desktop",
    "~/Library/Preferences/io.career-ops.desktop.plist",
    "~/Library/Saved Application State/io.career-ops.desktop.savedState",
  ]
end
