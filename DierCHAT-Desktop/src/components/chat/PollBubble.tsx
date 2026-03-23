import { useEffect, useState } from 'react';
import { api, type Message, type PollWithResults } from '@/api/client';
import { useTranslation } from '@/lib/i18n';
import './PollBubble.css';

const MESSAGE_TYPE_POLL = 8;

export interface PollBubbleProps {
  message: Message;
  isOwn: boolean;
  onVote?: () => void;
}

export function PollBubble({ message, isOwn, onVote }: PollBubbleProps) {
  const [pollData, setPollData] = useState<PollWithResults | null>(null);
  const [voting, setVoting] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (message.type !== MESSAGE_TYPE_POLL) return;
    api.getPoll(message.id).then(setPollData).catch(() => setPollData(null));
  }, [message.id, message.type]);

  if (message.type !== MESSAGE_TYPE_POLL) return null;
  if (!pollData?.poll) {
    return (
      <div className="poll-bubble poll-bubble--loading">
        {t('loading')}
      </div>
    );
  }

  const { poll, option_counts: counts, total_votes: total, user_vote_ids: userVotes } = pollData as PollWithResults & { option_counts?: number[]; total_votes?: number; user_vote_ids?: string[] };
  const totalVotes = total ?? (counts ?? []).reduce((a, b) => a + b, 0);

  async function handleVote(optionId: string) {
    if (voting) return;
    const selected = userVotes?.includes(optionId) ? [] : [optionId];
    if (!poll.allows_multiple && selected.length === 0) {
      // Toggle off - need to send empty to clear
      const others = (userVotes ?? []).filter(id => id !== optionId);
      if (others.length > 0) return; // can't toggle off the only one, would need to send others
    }
    const toSend = poll.allows_multiple
      ? userVotes?.includes(optionId)
        ? (userVotes ?? []).filter(id => id !== optionId)
        : [...(userVotes ?? []), optionId]
      : [optionId];
    setVoting(true);
    try {
      await api.votePoll(message.id, toSend);
      const updated = await api.getPoll(message.id);
      setPollData(updated ?? null);
      onVote?.();
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className={`poll-bubble poll-bubble--${isOwn ? 'own' : 'other'}`}>
      <div className="poll-question">{poll.question}</div>
      <div className="poll-options">
        {poll.options.map((opt, i) => {
          const count = counts?.[i] ?? opt.vote_count ?? 0;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const selected = userVotes?.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              className={`poll-option ${selected ? 'poll-option--selected' : ''}`}
              onClick={() => handleVote(opt.id)}
              disabled={voting}
            >
              <span className="poll-option-bar" style={{ width: `${pct}%` }} />
              <span className="poll-option-text">{opt.text}</span>
              <span className="poll-option-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="poll-footer">
        {totalVotes} {totalVotes === 1 ? 'голос' : totalVotes < 5 ? 'голоса' : 'голосов'}
      </div>
    </div>
  );
}
