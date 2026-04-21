package detectors_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eugene-lai/ai-kernel/internal/detectors"
	"github.com/stretchr/testify/assert"
)

func TestDetectVerifyCmds_NxProject(t *testing.T) {
	dir := t.TempDir()
	nx := `{"targetDefaults":{"lint":{},"test":{},"check:types":{}}}`
	os.WriteFile(filepath.Join(dir, "nx.json"), []byte(nx), 0644)
	pkg := `{"name":"my-app"}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	os.WriteFile(filepath.Join(dir, "pnpm-lock.yaml"), []byte(""), 0644)
	cmds := detectors.DetectVerifyCmds(dir)
	assert.Contains(t, cmds, "pnpm nx run <project>:check:types")
	assert.Contains(t, cmds, "pnpm nx run <project>:lint")
	assert.Contains(t, cmds, "pnpm nx run <project>:test")
}

func TestDetectVerifyCmds_PlainPackageJson(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"scripts":{"lint":"eslint .","test":"jest","typecheck":"tsc --noEmit"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	cmds := detectors.DetectVerifyCmds(dir)
	assert.Contains(t, cmds, "npm run lint")
	assert.Contains(t, cmds, "npm run test")
	assert.Contains(t, cmds, "npm run typecheck")
}

func TestDetectVerifyCmds_PnpmDetected(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "pnpm-lock.yaml"), []byte(""), 0644)
	pkg := `{"scripts":{"test":"jest"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	cmds := detectors.DetectVerifyCmds(dir)
	assert.Contains(t, cmds, "pnpm run test")
}
