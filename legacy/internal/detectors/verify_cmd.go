package detectors

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

var verifyScriptNames = []string{"lint", "test", "typecheck", "check:types", "type-check"}

func detectPackageManager(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "pnpm-lock.yaml")); err == nil {
		return "pnpm"
	}
	if _, err := os.Stat(filepath.Join(dir, "pnpm-workspace.yaml")); err == nil {
		return "pnpm"
	}
	if _, err := os.Stat(filepath.Join(dir, "yarn.lock")); err == nil {
		return "yarn"
	}
	return "npm"
}

func DetectVerifyCmds(dir string) []string {
	var cmds []string
	pm := detectPackageManager(dir)

	// Nx workspace
	if _, err := os.Stat(filepath.Join(dir, "nx.json")); err == nil {
		data, _ := os.ReadFile(filepath.Join(dir, "nx.json"))
		var nx struct {
			TargetDefaults map[string]interface{} `json:"targetDefaults"`
		}
		if json.Unmarshal(data, &nx) == nil {
			for _, name := range verifyScriptNames {
				if _, ok := nx.TargetDefaults[name]; ok {
					cmds = append(cmds, fmt.Sprintf("%s nx run <project>:%s", pm, name))
				}
			}
		}
		return cmds
	}

	// Plain package.json scripts
	pkgPath := filepath.Join(dir, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct {
			Scripts map[string]string `json:"scripts"`
		}
		if json.Unmarshal(data, &pkg) == nil {
			for _, name := range verifyScriptNames {
				if _, ok := pkg.Scripts[name]; ok {
					cmds = append(cmds, fmt.Sprintf("%s run %s", pm, name))
				}
			}
		}
	}

	return cmds
}
