package detectors

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
)

func DetectMCPTools(dir string) []MCPTool {
	data, err := os.ReadFile(filepath.Join(dir, ".mcp.json"))
	if err != nil {
		return nil
	}

	var mcp struct {
		McpServers map[string]struct {
			Command string   `json:"command"`
			Args    []string `json:"args"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal(data, &mcp); err != nil {
		return nil
	}

	var tools []MCPTool
	for name, server := range mcp.McpServers {
		tools = append(tools, MCPTool{Name: name, Command: server.Command})
	}
	sort.Slice(tools, func(i, j int) bool { return tools[i].Name < tools[j].Name })
	return tools
}
