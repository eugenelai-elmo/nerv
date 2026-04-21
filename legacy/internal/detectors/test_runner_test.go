package detectors_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eugene-lai/ai-kernel/internal/detectors"
	"github.com/stretchr/testify/assert"
)

func TestDetectTestRunner_Vitest(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"devDependencies":{"vitest":"1.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.TestRunnerVitest, detectors.DetectTestRunner(dir))
}

func TestDetectTestRunner_Jest(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"devDependencies":{"jest":"29.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.TestRunnerJest, detectors.DetectTestRunner(dir))
}

func TestDetectTestRunner_Pytest(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "pytest.ini"), []byte("[pytest]"), 0644)
	assert.Equal(t, detectors.TestRunnerPytest, detectors.DetectTestRunner(dir))
}

func TestDetectTestRunner_Go(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module foo\ngo 1.22"), 0644)
	assert.Equal(t, detectors.TestRunnerGo, detectors.DetectTestRunner(dir))
}

func TestDetectTestRunner_VitestTakesPrecedenceOverJest(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"devDependencies":{"vitest":"1.0.0","jest":"29.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.TestRunnerVitest, detectors.DetectTestRunner(dir))
}
