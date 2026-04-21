// internal/detectors/detectors.go
package detectors

type Platform string

const (
	PlatformIOS     Platform = "ios"
	PlatformWeb     Platform = "web"
	PlatformBackend Platform = "backend"
)

type TestRunner string

const (
	TestRunnerVitest TestRunner = "vitest"
	TestRunnerJest   TestRunner = "jest"
	TestRunnerPytest TestRunner = "pytest"
	TestRunnerGo     TestRunner = "go test"
	TestRunnerNone   TestRunner = ""
)

type MCPTool struct {
	Name    string
	Command string
}

type DetectResult struct {
	Platform   Platform
	TestRunner TestRunner
	VerifyCmds []string
	MCPTools   []MCPTool
}
