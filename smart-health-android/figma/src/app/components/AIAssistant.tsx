import { ArrowLeft, Send, Paperclip, Brain, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function AIAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: "Xin chào! Tôi là Trợ lý Y tế AI của bạn. Tôi có thể giúp bạn phân tích kết quả đo, đề xuất các chẩn đoán phân biệt và cung cấp hướng dẫn lâm sàng dựa trên bản thu âm ống nghe của bạn. Tôi có thể giúp gì cho bạn hôm nay?",
      timestamp: '13:45'
    },
    {
      id: 2,
      role: 'user',
      content: "Tôi vừa đo cho một bệnh nhân có tiếng ran nổ ở thùy dưới phổi trái. AI đã cảnh báo bất thường. Bạn có thể giải thích điều này có thể chỉ ra bệnh gì không?",
      timestamp: '13:46'
    },
    {
      id: 3,
      role: 'assistant',
      content: "Dựa trên tiếng ran nổ được phát hiện ở thùy dưới phổi trái, dưới đây là những yếu tố chính cần xem xét:\n\n**Các chẩn đoán có thể:**\n• **Viêm phổi** - Nguyên nhân phổ biến nhất của ran nổ khu trú\n• **Phù phổi** - Đặc biệt nếu xuất hiện ở hai bên hoặc bệnh nhân có tiền sử bệnh tim\n• **Xẹp phổi** - Phổi giãn nở không hoàn toàn\n• **Xơ phổi** - Nếu là ran nổ nhỏ, âm thanh giống như xé dán velcro\n\n**Các bước tiếp theo được đề xuất:**\n1. Kiểm tra dấu hiệu sinh tồn (sốt, độ bão hòa oxy)\n2. Yêu cầu chụp X-quang ngực để xác nhận\n3. Xem xét xét nghiệm công thức máu toàn phần (CBC) và các chỉ số viêm\n4. Đánh giá bệnh sử gần đây của bệnh nhân\n\n**Lưu ý lâm sàng:** Tiếng ran nổ nhỏ cuối thì hít vào không biến mất khi ho thường đáng lo ngại hơn tiếng ran nổ thô biến mất khi ho.\n\nBạn có muốn tôi phân tích dữ liệu dạng sóng cụ thể từ bản thu âm của bạn không?",
      timestamp: '13:47'
    }
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newUserMessage: Message = {
      id: messages.length + 1,
      role: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
    };

    setMessages([...messages, newUserMessage]);
    setInputValue('');

    setTimeout(() => {
      const newAssistantMessage: Message = {
        id: messages.length + 2,
        role: 'assistant',
        content: "Tôi đang phân tích câu hỏi của bạn. Trong ứng dụng thực tế, tính năng này sẽ được kết nối với mô hình AI đã được đào tạo dựa trên tài liệu y khoa và hướng dẫn lâm sàng để đưa ra các khuyến nghị có cơ sở khoa học.",
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
      };
      setMessages((prev) => [...prev, newAssistantMessage]);
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col relative pb-32">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-4 flex items-center justify-between border-b border-white/10 shadow-md sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-white" />
          <h1 className="text-white text-lg font-semibold">Trợ Lý Y Tế AI</h1>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 mb-6 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
              message.role === 'assistant'
                ? 'bg-gradient-to-br from-[#0B5C9A] to-[#00A896]'
                : 'bg-[#E2E8F0]'
            }`}>
              {message.role === 'assistant' ? (
                <Brain className="w-5 h-5 text-white" />
              ) : (
                <User className="w-5 h-5 text-[#0B5C9A]" />
              )}
            </div>
            <div className={`flex-1 max-w-[80%] flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                message.role === 'assistant'
                  ? 'bg-white border border-border'
                  : 'bg-[#0B5C9A] text-white'
              }`}>
                <p className="text-sm whitespace-pre-line leading-relaxed">{message.content}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1 px-2 font-medium">
                {message.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t border-border px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border border-border rounded-2xl p-2 flex items-end gap-2 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
            <button className="flex-shrink-0 p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </button>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Hỏi về triệu chứng, chẩn đoán, hoặc phương pháp điều trị..."
              className="flex-1 resize-none outline-none bg-transparent px-2 py-2 max-h-32 min-h-[2.5rem]"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="flex-shrink-0 bg-[#0B5C9A] text-white p-2 rounded-xl hover:bg-[#094A7D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[11px] text-center text-muted-foreground mt-2 font-medium">
            Trợ lý AI chỉ cung cấp đề xuất. Luôn xác minh bằng đánh giá chuyên môn lâm sàng.
          </p>
        </div>
      </div>
    </div>
  );
}
