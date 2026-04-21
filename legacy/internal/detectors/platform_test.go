package detectors_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eugene-lai/ai-kernel/internal/detectors"
	"github.com/stretchr/testify/assert"
)

func TestDetectPlatform_iOS(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "MyApp.xcodeproj"), 0755)
	assert.Equal(t, detectors.PlatformIOS, detectors.DetectPlatform(dir))
}

func TestDetectPlatform_Web(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"dependencies":{"react":"18.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.PlatformWeb, detectors.DetectPlatform(dir))
}

func TestDetectPlatform_WebVue(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"dependencies":{"vue":"3.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.PlatformWeb, detectors.DetectPlatform(dir))
}

func TestDetectPlatform_Backend(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module foo"), 0644)
	assert.Equal(t, detectors.PlatformBackend, detectors.DetectPlatform(dir))
}

func TestDetectPlatform_PackageJsonNoWebDeps(t *testing.T) {
	dir := t.TempDir()
	pkg := `{"dependencies":{"lodash":"4.0.0"}}`
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(pkg), 0644)
	assert.Equal(t, detectors.PlatformBackend, detectors.DetectPlatform(dir))
}
