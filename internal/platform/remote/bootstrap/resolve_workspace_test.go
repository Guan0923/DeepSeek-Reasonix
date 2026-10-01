package bootstrap

import "testing"

func TestWindowsWorkspaceRoundTripsToShell(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"drive backslash", `C:\Users\u\Desktop\x`, `C:\Users\u\Desktop\x`},
		{"drive slash", "C:/Users/u/Desktop/x", `C:\Users\u\Desktop\x`},
		{"sftp drive", "/C:/Users/u/Desktop/x", `C:\Users\u\Desktop\x`},
		{"UNC backslash", `\\srv\share\x`, `\\srv\share\x`},
		{"UNC slash", "//srv/share/x", `\\srv\share\x`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := (windowsShell{}).NativePath(c.in); got != c.want {
				t.Fatalf("NativePath(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
