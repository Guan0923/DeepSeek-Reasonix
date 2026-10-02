package shellparse

import "mvdan.cc/sh/v3/syntax"

type DeleteCall struct {
	Name string   `json:"name"`
	Args []string `json:"args"`
}

type DeleteAnalysis struct {
	Standalone bool         `json:"standalone"`
	Calls      []DeleteCall `json:"calls"`
}

func AnalyzeDeleteCalls(command string) (DeleteAnalysis, error) {
	file, err := ParseBash(command)
	if err != nil {
		return DeleteAnalysis{}, err
	}
	out := DeleteAnalysis{}
	if len(file.Stmts) == 1 {
		stmt := file.Stmts[0]
		call, ok := stmt.Cmd.(*syntax.CallExpr)
		out.Standalone = ok && len(call.Assigns) == 0 && len(stmt.Redirs) == 0 && !stmt.Background
	}
	syntax.Walk(file, func(node syntax.Node) bool {
		call, ok := node.(*syntax.CallExpr)
		if !ok || len(call.Args) == 0 {
			return true
		}
		name, _ := StaticWord(call.Args[0])
		parsed := DeleteCall{Name: name}
		for _, arg := range call.Args[1:] {
			value, _ := StaticWord(arg)
			parsed.Args = append(parsed.Args, value)
		}
		out.Calls = append(out.Calls, parsed)
		return true
	})
	out.Standalone = out.Standalone && len(out.Calls) == 1
	return out, nil
}

// PowerShellDeleteAnalysis parses stdin as data; it never invokes the supplied script.
const PowerShellDeleteAnalysis = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$source = [Console]::In.ReadToEnd()
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { exit 2 }
$calls = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true))
$result = @()
foreach ($call in $calls) {
 $arguments = @()
 foreach ($element in $call.CommandElements | Select-Object -Skip 1) {
  if ($element -is [System.Management.Automation.Language.CommandParameterAst]) {
   $arguments += '-' + $element.ParameterName
   if ($null -ne $element.Argument) { $arguments += '' }
  } elseif ($element -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
   $arguments += $element.Value
  } elseif ($element -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -and $element.NestedExpressions.Count -eq 0) {
   $arguments += $element.Value
  } else { $arguments += '' }
 }
 $result += @{name=$call.GetCommandName(); args=@($arguments)}
}
$standalone = $false
if ($ast.EndBlock.Statements.Count -eq 1 -and $calls.Count -eq 1) {
 $statement = $ast.EndBlock.Statements[0]
 $standalone = $statement -is [System.Management.Automation.Language.PipelineAst] -and $statement.PipelineElements.Count -eq 1 -and $statement.PipelineElements[0] -eq $calls[0] -and $calls[0].Redirections.Count -eq 0
}
@{standalone=$standalone; calls=@($result)} | ConvertTo-Json -Depth 5 -Compress
`
