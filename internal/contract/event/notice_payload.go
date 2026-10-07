package event

// DetailIsPayload reports that a coded notice's Detail is the typed payload its
// sentence is worded from, so a sink that prints Text must not append it again.
func DetailIsPayload(code string) bool {
	return code == NoticeCodeUnappliedSteer
}
