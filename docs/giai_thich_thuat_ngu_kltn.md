# CẨM NANG GIẢI THÍCH THUẬT NGỮ KHÓA LUẬN
*(Bản giải nghĩa ngôn ngữ bình dân, giúp bạn hiểu rõ bản chất để trả lời câu hỏi của Giảng viên hướng dẫn hoặc Hội đồng bảo vệ)*

---

### 1. Micro MEMS là gì?
- **MEMS** (Vi cơ điện tử). Hãy tưởng tượng nó là một cái Micro thu âm nhưng thay vì to bằng ngón tay với màng rung vật lý kồng kềnh, người ta dùng công nghệ khắc chip Silicon để thu nhỏ màng rung âm thanh bé bằng đầu kim. 
- **Tại sao dùng nó:** Vì nó siêu nhỏ, rẻ, ít tốn điện năng và đặc biệt là chống nhiễu điện từ cực kỳ tốt, áp sát vào lồng ngực cũng không bị nhiễu mồ hôi.

### 2. Giao thức I2S là gì?
- Rất cẩn thận tránh nhầm với **I2C** (dùng truyền data màn hình OLED). **I2S** là một giao tiếp chuẩn công nghiệp, sinh ra **CHỈ ĐỂ TRUYỀN ÂM THANH SỐ**. 
- Nó lấy tín hiệu âm thanh thu được từ Micro, biến luôn thành dòng mã nhị phân (0-1) và đẩy thẳng vào não vi điều khiển. Không cần mạch Analog sang Digital rườm rà (thứ vốn cực kì nhiễu sóng).

### 3. Định lý Nyquist là gì?
- Khi bạn ghi âm (chuyển sóng âm thành số), làm sao thiết bị biết phải "chụp" bao nhiêu tấm ảnh/giây để tái tạo cái âm thanh đó đầy đủ nhất? 
- **Định lý Nyquist nói rằng:** Tốc độ thu mẫu phải nhanh gấp ĐÔI tần số âm thanh cao nhất. Vd: Âm thanh tim phổi của người chỉ ở dải khoảng rải rác dưới $1000\text{Hz}$. Vậy hệ thống của bạn set tần số lấy mẫu là $f_s = 4000\text{Hz}$ (gấp 4 lần) => Dư sức tóm gọn tất cả các dị âm mà không mất mát tín hiệu.

### 4. Nhắn gọn PCG là gì?
- Nếu **ECG** (Điện tâm đồ) là dùng điện cực dán lên ngực để vẽ ra đường nhịp đập điện dẫn tim (tít... tít... tít).
- Thì **PCG** (Tâm âm đồ - Phonocardiogram) là dùng chính cái **âm thanh** lùng bùng (bùm... tặc, bùm... tặc) thu qua cái loa ống nghe, vẽ ra giấy thành một đường đồ thị dập dềnh. 

### 5. Cửa sổ Hamming là gì?
- Khi CPU (ESP32) muốn phân tích đoạn PCG, nó không thể xử lý nguyên một đoạn dài 1 phút, nó phải "băm" âm thanh ra thành hàng ngàn ô nhỏ vài chục mili-giây. 
- Ngay tại chỗ băm, tín hiệu dập dềnh bị cắt phăng cái rụp, tạo thành đường vuông góc. Vết cắt đó là lỗi số học tạo ra "nhiễu rò rỉ phổ" rất khó chịu. 
- **Hàm Hamming** đóng vai trò chèn vào nắn cho 2 mép đầu và cuối đường cắt cong dịu xuống bằng 0 một cách mượt mà. Nhờ thế thuật toán tính sẽ không bị sai.

### 6. MFCC - Mel Cepstrum là gì mà nghe sợ thế?
- Khi máy móc nhìn vào đoạn âm thanh, nó thấy một mớ bòng bong hàng chục ngàn con số. Nếu vứt thẳng cho Trí tuệ AI học thì nó tốn hàng tỉ phép tính, nổ RAM.
- Vậy phải **nén cục âm thanh** đó lại bằng thuật toán.
- Tại sao gọi là **Mel**: Thính giác con người là phi tuyến tính (nghe the thé thì rất thính, nghe siêu trầm thì điếc). Thang đo Mel được các nhà khoa học vẽ ra để "bắt máy móc nghe giống hình dáng đôi tai con người". 
- **Cepstrum:** Biến đổi qua lại bằng phân tích toán học.
- **Tóm tắt:** MFCC là quy trình nhai, nghiền cục âm thanh nhiễu loạn vài ngàn số kia, bóp lòi ra đúng 13 (hoặc cao nhất là 39) con số (vector). 13 số này chứa mọi đặc điểm danh tính cốt lõi nhất của nhịp tim giống như một bộ vân tay. AI chỉ việc cầm 13 con số này nhắm mắt cũng học ra kết quả bệnh học.

---

### 7. Kiến trúc AI - Lượng tử (Quantize) - MVVM Deadlock thực hiện ra sao?
**Training vs Inference:**
- **Pha Training (Máy tính làm):** ESP32 quá yếu để dạy AI. Bắt buộc bạn phải tải dữ liệu PCG trên mạng về, dùng Python trên Laptop xịn để đào tạo AI (Ví dụ bằng Rừng ngẫu nhiên - RandomForest) cho đến khi nó thông minh hiểu: âm thanh nào là bị mạch vành, bị ho lao.
- **Lượng tử hóa (Quantize):** AI sau khi khôn ra ở máy tính, tệp tin não của nó (Weight tensor) được quy ước bằng số nguyên Float32, rất nặng. ESP32 ko đủ RAM chứa. Quá trình lượng tử hóa sẽ dùng tool ép kiểu các số Float32 đó xuống còn số Int8 (hạ dung lượng xuống còn một phần tư). 
- **Pha Inference (ESP32 làm):** Không cần mạng. Bạn cầm tệp AI (Int8) đã được dịch sang ngôn ngữ C++, nhét vào ESP32. Từ đó ESP32 cứ đo được PCG là nó dự đoán ngay lập tức bệnh án luôn gọi là mô hình "Trí tuệ Biên - Edge AI".

**MVVM và Deadlock trên App Code:**
- App điện thoại có 2 việc: *(1) Liên tục đỡ sóng dữ liệu nhịp nhanh nháy tung mù mịt từ ống nghe truyền vào; (2) Vẽ biểu đồ cho mịn để Bác sĩ xem không bị chớp.*
- Nếu code ẩu, trộn chung đoạn code 1 và code 2. Sóng lao tới quá nhiều làm App đứng hình giật lag (chết ứng dụng - ANR hay còn gọi là Deadlock).
- Thằng Model-View-ViewModel (MVVM) tách riêng 2 luồng này ra, một thợ giấu mặt (Backend Thread) chuyên đỡ gói dữ liệu dọn sẵn ra đĩa; tay kia (UI Thread) chuyên gắp đĩa 1 cách ung dung vẽ lên màn hình. Siêu mượt. 

---

### 8. Vụ án WebSocket và Firebase: Giống hay khác?
Mô hình hiện tại của bạn dùng cả hai và phải rạch ròi 2 mục đích sống còn:
- **Firebase Database (Kho lưu lữ):** Giống như Bưu điện. Bạn truyền tín hiệu về Database, đóng gói nó thành File. Khi nào Bác sĩ rảnh, lên Cloud tải File đó xuống phân tích, hoặc làm nhật ký y học (EHR) lưu trữ 50 năm vẫn đọc lại được. Việc gửi/lấy File tốn tầm cài mili-giây đến vài giây.
- **WebSocket (Real-time Live):** Nhấn mạnh chữ Live. Giống gọi Video Call. Cục ESP32 trên ngực người khám tạo một mạch nước chảy thẳng ruột tới cái App trên tay bác sĩ ở Mỹ. Bác sĩ thấy nhịp tim đập ngay lập tức (Độ trễ < 0.1s) không phải chờ đợi lưu kho hay lấy kho. Nghĩa là Bác sĩ **Nghe nhịp tim cách nửa vòng Trái Đất NGAY LẬP TỨC**. 

Đề tài áp dụng 2 nhánh là quá đẳng cấp!

---

### 9. Tiếng Rales và Murmurs là gì (Y học)
Để chém gió vững vàng lúc bảo vệ luận án bạn cần thuộc lòng 2 chữ này (Đây là cái mà AI sẽ thay thế tai người):
- **Tiếng Rales (Ran vặn ở Phổi):** Là âm thanh lép bép lạo xạo. Giống hệt bạn lấy lọn tóc, chà xát cọ xát gần bên lỗ tai. Đó là lúc ống nghe phát hiện túi khí (phế nang) ở phổi đang bị chứa dịch nhờn, nhớt nghẹt (Dấu hiệu viêm phổi, phổi tắc nghẽn mãn tính COPD).
- **Murmurs (Tiếng thổi ở tim):** Bình thường tim bơm máu kêu Pùm-tặc. Nhưng nếu van tim hở/lủng/hẹp. Máu xịt xuyên qua cái khe hở đó với áp suất lớn rít lên dải âm rất siêu trầm hoặc lèo xèo tạp âm. Thính lực người già (Bác sĩ lớn tuổi) nghe lùng bùng hay bị rơi nhịp, nhưng Model AI nhìn đặc trưng MFCC thì sẽ xé toạc lớp vỏ rác, nhận diện ra ngay!
