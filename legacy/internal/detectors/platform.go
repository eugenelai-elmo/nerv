package detectors

import (
	"encoding/json"
	"os"
	"path/filepath"
)

var webDeps = []string{"react", "vue", "angular", "next", "nuxt", "svelte", "solid-js", "vite"}

func DetectPlatform(dir string) Platform {
	// iOS: any .xcodeproj directory
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.IsDir() && filepath.Ext(e.Name()) == ".xcodeproj" {
			return PlatformIOS
		}
	}

	// Web: package.json with known web framework deps
	pkgPath := filepath.Join(dir, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct {
			Dependencies    map[string]string `json:"dependencies"`
			DevDependencies map[string]string `json:"devDependencies"`
		}
		if json.Unmarshal(data, &pkg) == nil {
			for _, dep := range webDeps {
				if _, ok := pkg.Dependencies[dep]; ok {
					return PlatformWeb
				}
				if _, ok := pkg.DevDependencies[dep]; ok {
					return PlatformWeb
				}
			}
		}
	}

	return PlatformBackend
}
