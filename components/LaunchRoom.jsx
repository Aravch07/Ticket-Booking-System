"use client";
import { useEffect, useState } from 'react';
import { Clock3, Users, ArrowUpRight, ShieldCheck, Ticket, LoaderCircle } from 'lucide-react';
import { Button, Eyebrow, fullDate, timeLabel } from './ui.jsx';

const when = date => `${fullDate(date)} · ${timeLabel(date)} IST`;
export default function LaunchRoom({ launch, serverTime, user, busy, onJoin, pollError }) {
  const [remaining, setRemaining] = useState('');
  const target = launch.phase === 'scheduled' ? launch.waitingRoomAt : launch.nextBatchAt;
  useEffect(() => {
    const clock = new Date(serverTime).getTime(), started = Date.now();
    const update = () => {
      const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - clock - (Date.now() - started)) / 1000));
      const days = Math.floor(seconds / 86400), hours = Math.floor(seconds / 3600) % 24;
      setRemaining(`${days ? days + 'd ' : ''}${String(hours).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
    };
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [target, serverTime]);
  const queued = !!launch.entry;
  return <section className="launch-room" aria-label="Ticket launch waiting room">
    <div className="launch-room-main">
      <Eyebrow><span className="live-dot" />{launch.phase === 'scheduled' ? 'THE COUNTDOWN IS ON' : queued ? 'YOUR PLACE IS SAVED' : 'THE TICKET DROP STARTS HERE'}</Eyebrow>
      <h2>{launch.phase === 'scheduled' ? 'Big nights start with a little anticipation.' : queued ? 'You’re in line. Let the night come to you.' : 'One queue. A fair shot at the night.'}</h2>
      <p>{launch.phase === 'scheduled' ? 'This show is already on the map. Come back when its launch waiting room opens.' : 'Fans enter booking in arrival order, in batches of up to 100 every five minutes. Your queue number stays with your account, even after a refresh.'}</p>
      <div className="launch-schedule"><span><Clock3 size={16} />Waiting room<strong>{when(launch.waitingRoomAt)}</strong></span><span><Ticket size={16} />Ticket sales<strong>{when(launch.salesOpenAt)}</strong></span></div>
      <div className="launch-rules"><span><Users size={16} />100 per batch</span><span><Clock3 size={16} />Every 5 minutes</span><span><ShieldCheck size={16} />Server-controlled entry</span></div>
      <p className="small-note">Entry to booking does not reserve a ticket. Class availability, the four-ticket limit, and seat holds still apply. Once the launch queue is empty, booking opens to everyone.</p>
    </div>
    <div className="launch-room-ticket" aria-live="polite">
      {queued ? <><span>YOUR QUEUE NUMBER</span><strong className="launch-number">#{launch.entry.queueNumber}</strong><p>{launch.entry.position > 1 ? `${launch.entry.position - 1} fans ahead of you` : 'You’re in the next batch'}</p></> : <><Users size={38} /><h3>{launch.phase === 'scheduled' ? 'Save the date.' : 'Get your place.'}</h3></>}
      <div className="launch-timer"><span>{launch.phase === 'scheduled' ? 'WAITING ROOM OPENS IN' : launch.phase === 'waiting_room' ? 'TICKETS OPEN IN' : 'NEXT BATCH IN'}</span><strong>{remaining || '00:00:00'}</strong></div>
      <p>{launch.waiting} {launch.waiting === 1 ? 'fan' : 'fans'} in the launch queue</p>
      {launch.phase !== 'scheduled' && !queued && <Button className="button-primary full-width" onClick={onJoin} loading={busy}>{user ? 'Join launch waiting room' : 'Sign in to join the queue'}<ArrowUpRight size={17} /></Button>}
      {queued && <span className="launch-live"><LoaderCircle size={14} className="spin" />{pollError || 'Your entry opens automatically'}</span>}
    </div>
  </section>;
}
