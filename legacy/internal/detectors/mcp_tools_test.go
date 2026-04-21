package detectors_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eugene-lai/ai-kernel/internal/detectors"
	"github.com/stretchr/testify/assert"
)

func TestDetectMCPTools_ReadsMcpJson(t *testing.T) {
	dir := t.TempDir()
	mcp := `{"mcpServers":{"serena":{"command":"uvx","args":["serena"]},"nx-mcp":{"command":"npx","args":["nx-mcp"]}}}`
	os.WriteFile(filepath.Join(dir, ".mcp.json"), []byte(mcp), 0644)
	tools := detectors.DetectMCPTools(dir)
	assert.Len(t, tools, 2)
	assert.Equal(t, "nx-mcp", tools[0].Name) // sorted alphabetically: n < s
	assert.Equal(t, "serena", tools[1].Name)
}

func TestDetectMCPTools_EmptyWhenNoFile(t *testing.T) {
	dir := t.TempDir()
	tools := detectors.DetectMCPTools(dir)
	assert.Empty(t, tools)
}
