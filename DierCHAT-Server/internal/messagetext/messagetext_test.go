package messagetext

import "testing"

func TestStripInvisibleGarbage(t *testing.T) {
	const zwsp = "\u200b"
	const bom = "\ufeff"
	s := "hello" + zwsp + " world" + bom
	got := StripInvisibleGarbage(s)
	want := "hello world"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if StripInvisibleGarbage("a\t\n b") != "a\t\n b" {
		t.Fatal("should keep tabs and newlines")
	}
}
