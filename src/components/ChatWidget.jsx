import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function ChatWidget({ currentUser, targetUser, isOpen, onClose, isEmbedded = false, isTargetOnline = false }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!currentUser || !targetUser || !isOpen) return;
    const fetchMsgs = async () => {
      const { data } = await supabase.from("chat_messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMsgs();

    // Polling fallback setiap 2 detik 
    const interval = setInterval(() => {
      fetchMsgs();
    }, 2000);

    const channel = supabase.channel(`chat_${currentUser.id}_${targetUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        const msg = payload.new;
        if ((msg.sender_id === currentUser.id && msg.receiver_id === targetUser.id) ||
            (msg.sender_id === targetUser.id && msg.receiver_id === currentUser.id)) {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      })
      .subscribe();
      
    return () => { 
      clearInterval(interval);
      supabase.removeChannel(channel); 
    };
  }, [currentUser, targetUser, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const { data, error } = await supabase.from("chat_messages").insert({
      sender_id: currentUser.id,
      receiver_id: targetUser.id,
      message: text
    }).select().single();
    if (!error && data) {
      setText("");
      // Add the message to local state immediately
      setMessages(prev => {
        // Prevent duplicate if Realtime is enabled and already added it
        if (prev.find(m => m.id === data.id)) return prev;
        return [...prev, data];
      });
    } else {
      alert("Gagal kirim pesan: " + error.message);
      console.error(error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `chat-${currentUser.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName);
      const fileUrl = urlData.publicUrl;

      // Determine if image or other file
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt.toLowerCase());
      const prefix = isImage ? '[IMG]' : '[FILE]';
      const messageText = `${prefix}${fileUrl}`;

      const { data: msgData, error: dbError } = await supabase.from("chat_messages").insert({
        sender_id: currentUser.id,
        receiver_id: targetUser.id,
        message: messageText
      }).select().single();

      if (dbError) throw dbError;

      setMessages(prev => {
        if (prev.find(m => m.id === msgData.id)) return prev;
        return [...prev, msgData];
      });
    } catch (err) {
      alert("Gagal mengunggah file: " + err.message);
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  const containerStyle = isEmbedded 
    ? { width: "100%", height: "100%", backgroundColor: "#fff", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0" }
    : { position: "fixed", bottom: "80px", right: "20px", width: "320px", height: "450px", backgroundColor: "#fff", borderRadius: "12px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", zIndex: 9999, overflow: "hidden", border: "1px solid #e2e8f0" };

  return (
    <div style={containerStyle}>
      <div style={{ padding: "12px 16px", backgroundColor: "#10b981", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div>Chat {targetUser.id === '00000000-0000-0000-0000-000000000000' ? 'dengan Admin' : targetUser.name}</div>
          <div style={{ fontSize: "11px", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px", opacity: 0.9 }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: isTargetOnline ? "#4ade80" : "#94a3b8" }}></span>
            {isTargetOnline ? "Online" : "Offline"}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: "16px", padding: 0 }}>✖</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", backgroundColor: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.map(m => {
          const isMe = m.sender_id === currentUser.id;
          return (
            <div key={m.id} style={{ alignSelf: isMe ? "flex-end" : "flex-start", backgroundColor: isMe ? "#10b981" : "#e2e8f0", color: isMe ? "#fff" : "#1e293b", padding: "8px 12px", borderRadius: "12px", borderBottomRightRadius: isMe ? "2px" : "12px", borderBottomLeftRadius: !isMe ? "2px" : "12px", maxWidth: "85%", fontSize: "13px", lineHeight: "1.4" }}>
              {m.message.startsWith('[IMG]') ? (
                <img src={m.message.replace('[IMG]', '')} alt="attachment" style={{ maxWidth: '100%', borderRadius: '8px', cursor: 'pointer', marginTop: '4px' }} onClick={() => window.open(m.message.replace('[IMG]', ''), '_blank')} />
              ) : m.message.startsWith('[FILE]') ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  <a href={m.message.replace('[FILE]', '')} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 'bold' }}>
                    Unduh File Lampiran
                  </a>
                </div>
              ) : (
                m.message
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display: "flex", borderTop: "1px solid #e2e8f0", padding: "12px", backgroundColor: "#fff", alignItems: "center" }}>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ background: "none", border: "none", cursor: "pointer", padding: "8px", color: "#64748b" }}>
          <svg style={{ width: "20px", height: "20px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
        </button>
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder={isUploading ? "Mengunggah..." : "Tulis pesan..."} disabled={isUploading} style={{ flex: 1, padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "20px", outline: "none", fontSize: "13px" }} />
        <button type="submit" disabled={isUploading} style={{ marginLeft: "8px", padding: "8px 16px", backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: "20px", fontWeight: 600, cursor: "pointer", fontSize: "13px", opacity: isUploading ? 0.5 : 1 }}>Kirim</button>
      </form>
    </div>
  );
}
