package detectors

import (
	"encoding/json"
	"os"
	"path/filepath"
)

func DetectTestRunner(dir string) TestRunner {
	pkgPath := filepath.Join(dir, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct {
			DevDependencies map[string]string `json:"devDependencies"`
		}
		if json.Unmarshal(data, &pkg) == nil {
			if _, ok := pkg.DevDependencies["vitest"]; ok {
				return TestRunnerVitest
			}
			if _, ok := pkg.DevDependencies["jest"]; ok {
				return TestRunnerJest
			}
		}
	}

	for _, f := range []string{"pytest.ini", "pyproject.toml", "setup.cfg"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return TestRunnerPytest
		}
	}

	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
		return TestRunnerGo
	}

	return TestRunnerNone
}
