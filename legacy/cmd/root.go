package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// version is injected at build time via -ldflags:
//
//	go build -ldflags="-X github.com/eugene-lai/ai-kernel/cmd.version=1.0.0"
var version = "dev"

func init() {
	rootCmd.Version = version
}

var rootCmd = &cobra.Command{
	Use:   "ai-kernel",
	Short: "AI agent kernel management",
	Long:  "Manages the ai-kernel submodule for Claude Code agent workflows.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
