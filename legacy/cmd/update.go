// cmd/update.go
package cmd

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update ai-kernel submodule to latest",
	RunE:  runUpdate,
}

func init() {
	rootCmd.AddCommand(updateCmd)
}

func runUpdate(cmd *cobra.Command, args []string) error {
	dir, _ := os.Getwd()
	c := exec.Command("git", "submodule", "update", "--remote", ".ai/base")
	c.Dir = dir
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	if err := c.Run(); err != nil {
		return fmt.Errorf("submodule update failed: %w", err)
	}
	fmt.Println("✓ .ai/base updated to latest")
	return nil
}
