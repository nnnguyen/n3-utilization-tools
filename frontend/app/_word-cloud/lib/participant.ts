const PARTICIPANT_SESSION_ID_KEY = 'word_cloud_participant_session_id';

export function getParticipantSessionId(): string {
  let id = localStorage.getItem(PARTICIPANT_SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PARTICIPANT_SESSION_ID_KEY, id);
  }
  return id;
}
