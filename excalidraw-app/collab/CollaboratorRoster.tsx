import React, { useState } from "react";
import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import "./CollaboratorRoster.scss";

type Props = {
  collaborators: Map<SocketId, Collaborator>;
  currentSocketId?: string | null;
  onKick?: (socketId: SocketId) => void;
};

export const CollaboratorRoster = ({ collaborators, currentSocketId, onKick }: Props) => {
  const [open, setOpen] = useState(false);

  const list = Array.from(collaborators.entries()).map(([id, c]) => ({
    socketId: id,
    username: c.username || "Anonymous",
    isCurrentUser: c.isCurrentUser || id === currentSocketId,
    color: (c as any).color?.background || "#4169ff",
  }));

  if (list.length === 0) return null;

  return (
    <div className="zp-roster">
      <button
        type="button"
        className="zp-roster-pill"
        onClick={() => setOpen(!open)}
        title="View people on this board"
      >
        <div className="zp-roster-avatars">
          {list.slice(0, 3).map((user) => (
            <span
              key={user.socketId}
              className="zp-roster-avatar"
              style={{ backgroundColor: user.color }}
              title={user.username}
            >
              {user.username.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
        <span className="zp-roster-count">{list.length} online</span>
      </button>

      {open && (
        <div className="zp-roster-dropdown">
          <div className="zp-roster-header">
            <h4>Live on Board ({list.length})</h4>
            <button type="button" className="zp-roster-close" onClick={() => setOpen(false)}>×</button>
          </div>
          <ul className="zp-roster-list">
            {list.map((user) => (
              <li key={user.socketId} className="zp-roster-item">
                <div className="zp-roster-user-info">
                  <span
                    className="zp-roster-avatar-sm"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="zp-roster-name">
                    {user.username} {user.isCurrentUser && <span className="zp-you-badge">(You)</span>}
                  </span>
                </div>
                {!user.isCurrentUser && onKick && (
                  <button
                    type="button"
                    className="zp-roster-kick-btn"
                    onClick={() => {
                      if (window.confirm(`Remove ${user.username} from this session?`)) {
                        onKick(user.socketId as SocketId);
                      }
                    }}
                    title="Remove user from board"
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
