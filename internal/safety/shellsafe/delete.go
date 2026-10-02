package shellsafe

import "strings"

// RecursiveDeleteTargets returns empty targets for extents static analysis cannot establish.
func RecursiveDeleteTargets(name string, args []string, powerShell bool) ([]string, bool) {
	base, args, known := unwrapDeleteCommand(name, args)
	if !known {
		return []string{""}, true
	}
	switch base {
	case "rm", "remove-item", "ri", "del", "erase", "rd", "rmdir":
	default:
		return nil, false
	}
	recursive := false
	var targets []string
	options := true
	for _, arg := range args {
		lower := strings.ToLower(arg)
		if options && arg == "--" {
			options = false
			continue
		}
		if arg == "" {
			return []string{""}, true
		}
		if options && strings.HasPrefix(arg, "-") {
			if powerShell {
				flag := strings.TrimPrefix(lower, "-")
				switch {
				case flag != "" && strings.HasPrefix("recurse", flag):
					recursive = true
				case flag != "" && strings.HasPrefix("force", flag):
				case flag == "literalpath", flag == "path":
				default:
					return []string{""}, true
				}
			} else {
				if strings.HasPrefix(arg, "--") {
					if strings.HasPrefix("--recursive", arg) {
						recursive = true
					} else if arg != "--force" && arg != "--verbose" {
						return []string{""}, true
					}
				} else if strings.ContainsAny(arg[1:], "rR") {
					recursive = true
				}
			}
			continue
		}
		if (base == "del" || base == "erase" || base == "rd" || base == "rmdir") && strings.HasPrefix(lower, "/") {
			switch lower {
			case "/s":
				recursive = true
			case "/q", "/f":
			default:
				return []string{""}, true
			}
			continue
		}
		targets = append(targets, arg)
	}
	if !recursive {
		return nil, false
	}
	if len(targets) == 0 {
		targets = []string{""}
	}
	return targets, true
}
