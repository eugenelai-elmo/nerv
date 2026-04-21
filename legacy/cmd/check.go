// cmd/check.go
package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var checkCmd = &cobra.Command{
	Use:   "check [paths...]",
	Short: "Report which repos have stale ai-kernel submodule pins",
	Args:  cobra.MinimumNArgs(1),
	RunE:  runCheck,
}

func init() {
	rootCmd.AddCommand(checkCmd)
}

func runCheck(cmd *cobra.Command, args []string) error {
	for _, rawPath := range args {
		path, err := expandPath(rawPath)
		if err != nil {
			fmt.Printf("%-40s  ERROR (%s)\n", rawPath, err)
			continue
		}
		checkRepo(rawPath, path)
	}
	return nil
}

func checkRepo(display, path string) {
	basePath := filepath.Join(path, ".ai", "base")
	if _, err := os.Stat(basePath); os.IsNotExist(err) {
		fmt.Printf("%-40s  MISSING (.ai/base not found)\n", display)
		return
	}

	// Get pinned commit
	out, err := runGit(path, "submodule", "status", ".ai/base")
	if err != nil {
		fmt.Printf("%-40s  ERROR (submodule status: %s)\n", display, err)
		return
	}
	fields := strings.Fields(strings.TrimLeft(out, " +-"))
	if len(fields) == 0 {
		fmt.Printf("%-40s  ERROR (submodule not initialised — run: git submodule update --init)\n", display)
		return
	}
	pinnedHash := fields[0]

	// Get remote URL
	remoteURL, err := runGit(basePath, "remote", "get-url", "origin")
	if err != nil {
		fmt.Printf("%-40s  ERROR (get remote: %s)\n", display, err)
		return
	}
	remoteURL = strings.TrimSpace(remoteURL)

	// Get latest commit on remote
	lsOut, err := runGit("", "ls-remote", remoteURL, "HEAD")
	if err != nil {
		fmt.Printf("%-40s  ERROR (ls-remote: %s)\n", display, err)
		return
	}
	latestHash := strings.Fields(lsOut)[0]

	if pinnedHash == latestHash {
		fmt.Printf("%-40s  OK\n", display)
		return
	}

	// Fetch to get remote objects locally, then count
	runGit(basePath, "fetch", "--quiet", "origin") // ignore error — best effort
	countOut, err := runGit(basePath, "rev-list", "--count", pinnedHash+".."+latestHash)
	if err != nil {
		fmt.Printf("%-40s  BEHIND\n", display)
		return
	}
	fmt.Printf("%-40s  BEHIND (%s commits)\n", display, strings.TrimSpace(countOut))
}

func runGit(dir string, args ...string) (string, error) {
	c := exec.Command("git", args...)
	if dir != "" {
		c.Dir = dir
	}
	out, err := c.Output()
	return string(out), err
}

func expandPath(p string) (string, error) {
	if strings.HasPrefix(p, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, p[2:]), nil
	}
	return filepath.Abs(p)
}
