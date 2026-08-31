# Video pipeline

1. Import (upload ou URL)
2. `ProjectStatus`: CREATED → UPLOADING → QUEUED → PROCESSING → TRANSCRIBING → ANALYZING → GENERATING → READY
3. Transcrição (`Transcript` + `TranscriptSegment`)
4. IA (`AIProvider`) devolve candidatos com scores 0–100
5. Clipes + legendas
6. Editor / render (`RenderJob`)
7. Publicação

O processamento continua se o usuário sair da página. O progresso fica em `ProcessingJob`.

Sem `OPENAI_API_KEY` ou FFmpeg, o pipeline usa providers mock **explicitamente**.
