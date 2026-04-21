// cmd/init.go
package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Scaffold .ai/ structure and add ai-kernel submodule",
	RunE:  runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

const baseRepoURL = "https://github.com/eugenelai-elmo/ai-kernel"

func runInit(cmd *cobra.Command, args []string) error {
	dir, _ := os.Getwd()
	aiDir := filepath.Join(dir, ".ai")

	if _, err := os.Stat(filepath.Join(aiDir, "base")); err == nil {
		fmt.Println("✓ .ai/base already exists — skipping submodule add")
	} else {
		fmt.Println("→ Adding ai-kernel submodule...")
		c := exec.Command("git", "submodule", "add", baseRepoURL, ".ai/base")
		c.Dir = dir
		c.Stdout = os.Stdout
		c.Stderr = os.Stderr
		if err := c.Run(); err != nil {
			return fmt.Errorf("git submodule add failed: %w", err)
		}
	}

	// Scaffold directories
	for _, d := range []string{".ai/loops", ".ai/bin"} {
		os.MkdirAll(filepath.Join(dir, d), 0755)
	}

	// Generate CLAUDE.md
	claudePath := filepath.Join(aiDir, "CLAUDE.md")
	if _, err := os.Stat(claudePath); os.IsNotExist(err) {
		if err := os.WriteFile(claudePath, []byte(claudeMDContent), 0644); err != nil {
			return fmt.Errorf("writing CLAUDE.md: %w", err)
		}
		fmt.Println("✓ Generated .ai/CLAUDE.md")
	}

	// Generate repo-intelligence.md stub
	riPath := filepath.Join(aiDir, "repo-intelligence.md")
	if _, err := os.Stat(riPath); os.IsNotExist(err) {
		if err := os.WriteFile(riPath, []byte(repoIntelligenceStub), 0644); err != nil {
			return fmt.Errorf("writing repo-intelligence.md: %w", err)
		}
		fmt.Println("✓ Generated .ai/repo-intelligence.md (stub — fill in project context)")
	}

	// Generate wrapper script
	wrapperPath := filepath.Join(aiDir, "bin", "ai-kernel")
	if err := os.WriteFile(wrapperPath, []byte(wrapperScript), 0755); err != nil {
		return fmt.Errorf("writing wrapper script: %w", err)
	}
	fmt.Println("✓ Generated .ai/bin/ai-kernel (version-locked wrapper)")

	fmt.Println("")
	fmt.Println("Next steps:")
	fmt.Println("  1. Run: .ai/bin/ai-kernel detect")
	fmt.Println("  2. Review .ai/loops/execution.md and .ai/tool-overrides.md")
	fmt.Println("  3. Fill in .ai/repo-intelligence.md with project context")
	fmt.Println("  4. Add @.ai/CLAUDE.md to your project root CLAUDE.md")
	fmt.Println("  5. git add .ai/ && git commit -m 'chore: add ai-kernel'")
	return nil
}

const claudeMDContent = `@.ai/base/CLAUDE.md

# Project Context
@.ai/repo-intelligence.md
`

const repoIntelligenceStub = `# Repo Intelligence

## Project
<!-- One paragraph: what this repo does, who uses it, key domain concepts -->

## Architecture
<!-- Key architectural decisions, module boundaries, patterns to follow -->

## Common Gotchas
<!-- Non-obvious things that trip up new contributors -->
`

const wrapperScript = `#!/bin/sh
# Version-locked ai-kernel wrapper — always uses the pinned submodule binary.
KERNEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
exec "$KERNEL_DIR/base/bin/ai-kernel-$OS-$ARCH" "$@"
`
