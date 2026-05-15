# KỊCH BẢN SLIDE TRÌNH BÀY ĐỀ CƯƠNG KHÓA LUẬN
*(Tài liệu này được thiết kế để bạn copy trực tiếp Title và Text vào các trang Slide PowerPoint (PPT). Phần "Lời thoại trình bày" là kịch bản để bạn đứng thuyết trình thật trôi chảy trước mặt Thầy cô).*

---

## SLIDE 1: TRANG BÌA (TITLE SLIDE)
- **Tiêu đề chính:** Thiết kế và chế tạo Hệ thống Ống nghe Y tế Điện tử Thông minh tích hợp Phân tích Âm học và Edge AI.
- **Tiêu đề phụ:** Báo cáo Kế hoạch triển khai Khóa luận Tốt nghiệp
- **Sinh viên thực hiện:** [Tên của bạn] - MSSV: [...]
- **Giảng viên hướng dẫn:** [Tên Thầy/Cô]

🗣️ **Lời thoại trình bày:** 
*"Kính chào Thầy/Cô. Hôm nay em xin phép trình bày đề xuất kế hoạch triển khai đề tài dự án Khóa luận tốt nghiệp về thiết kế hệ thống Ống nghe y tế điện tử thông minh tích hợp trí tuệ nhân tạo và hệ sinh thái Telemedicine."*

---

## SLIDE 2: ĐẶT VẤN ĐỀ TẠI SAO LÀM DỰ ÁN NÀY? (PROBLEM STATEMENT)
- **Hạn chế của y tế truyền thống:**
  - Ống nghe cơ học phụ thuộc hoàn toàn vào thính lực và kinh nghiệm cảm tính của Y bác sĩ.
  - Rất dễ trượt mất các dị âm vi thể âm tần thấp (như tiếng Murmurs van tim hay Rales ran ở phổi).
  - Không thể lưu trữ âm thanh để hội chẩn chéo hoặc theo dõi bệnh án điện tử (EHR).
- **Yêu cầu thời đại kĩ thuật số:** Cần một thiết bị có khả năng "nghe thay con người", lưu trữ thời gian thực và chẩn đoán từ xa qua Internet (Telemedicine).

🗣️ **Lời thoại trình bày:** 
*"Điểm xuất phát của em đến từ một thực tế điểm yếu của ống nghe y tế cơ học là quá phụ thuộc vào đôi tai của bác sĩ. Lỡ bác sĩ mệt, hoặc thính lực người già kém, thì rất dễ lọt lưới các tạp âm bệnh nhỏ xíu ở tim. Vì vậy, em quyết tâm số hóa quá trình này."*

---

## SLIDE 3: MỤC TIÊU VÀ SẢN PHẨM CỐT LÕI (OBJECTIVES)
**Mục tiêu hệ thống hoàn chỉnh 3 lớp:**
1. **Thiết bị IoT (Edge Node):** Ống nghe điện toán in 3D, lấy dữ liệu âm thanh số I2S từ cảm biến MEMS. Xử lý thuật toán trực tiếp.
2. **Hạ tầng Mạng (Cloud):** WebSocket (phát Real-time trực tiếp không độ trễ) và Firebase (Lưu tệp bệnh án).
3. **Ứng dụng Di động (App):** Hiển thị nhịp sóng tim phổi mịn tới mili-giây, kết hợp Chatbot giải đáp.

🗣️ **Lời thoại trình bày:** 
*"Do đó mục tiêu cốt lõi của đề tài này là em sẽ xây dựng toàn bộ 3 tầng công nghệ: Làm ra phần cứng ống nghe, xây dựng luồng băng thông mạng đám mây và một App chuẩn y khoa dành riêng cho bác sĩ và người dùng."*

---

## SLIDE 4: PHƯƠNG PHÁP TRIỂN KHAI PHẦN CỨNG (HARDWARE IMPLEMENTATION)
- **Module cảm biến:** Mic MEMS (INMP441) kết nối chuẩn I2S, truyền thẳng mã nhị phân vào chip để loại bỏ 100% nhiễu Analog so với bộ chuyển ADC thông thường.
- **Vi xử lý trung tâm đa luồng (ESP32):**
  - **Core 0** chạy luồng truy cập tự động DMA đọc sóng âm tốc độ cực đại.
  - **Core 1** chạy FreeRTOS vẽ lên màn hình OLED và gửi dữ liệu đi.
- **Quy trình gia công:** Cắm Test Breadboard -> Làm mạch in PCB riêng -> Thiết kế vỏ nhựa Chest-piece in 3D.

🗣️ **Lời thoại trình bày:** 
*"Về cách triển khai phần cứng thân máy, bí quyết chống nhiễu của em là bỏ hoàn toàn mạch đọc Analog cũ mèm, mà xài hẳn cổng thu âm I2S của mic MEMS phóng số liệu thẳng về CPU qua đường truyền DMA. Em sẽ cấu hình Dual-core, Core 0 chỉ dùng để thu sóng, Core 1 chạy OLED và mạng để chống đứng máy."*

---

## SLIDE 5: PHƯƠNG PHÁP TRIỂN KHAI XỬ LÝ SỐ VÀ AI (DSP & TINYML)
**Chuỗi xử lý tín hiệu "Pipeline":**
1. **Lọc thông dải (Bandpass Filter):** Cắt giữ đúng dải $20 - 400\text{Hz}$ (Tâm âm) và bỏ sóng rác.
2. **Cửa sổ Hamming & FFT:** Ngăn hiện tượng rò rỉ phổ (Spectral leakage) và chuyển đổi từ miền Thời gian sang Tần số.
3. **Trích xuất đặc trưng MFCC:** Nén khối âm thanh thành chuỗi vector đại diện (mô phỏng nhĩ bộ con người).
4. **Nhúng AI (TinyML):** Huấn luyện Random Forest ở Laptop -> Hạ cấp bộ nhớ (Quantization Int8) -> Nhúng lên ESP32.

🗣️ **Lời thoại trình bày:** 
*"Ngay trên chip ESP32, thay vì vứt hết data cho App phân tích thì em áp dụng điện toán biên - Edge AI. Đưa tín hiệu thô qua bộ lọc Bandpass, qua cửa sổ Hamming để tránh rò phổ vỡ ảnh do băm nhỏ tín hiệu. Tiếp tục chạy màng lọc MFCC để ép ra 13 đặc trưng vân tay. Sau đó AI ngay trong con chip sẽ tức khắc biết người này bệnh trào dịch hay màng tim đang hở."*

---

## SLIDE 6: KẾ HOẠCH PHÁT TRIỂN APP VÀ CLOUD (SOFTWARE IMPLEMENTATION)
- **Tốc độ truyền dữ liệu tuyệt đối:** Sử dụng giao thức **WebSocket** truyền dữ liệu tốc độ cực căng (độ trễ siêu thấp) vẽ đồ thị Live thời gian thực cho Bác sĩ cách đó nửa vòng Trái Đất.
- **Kho lưu trữ EHR:** Dùng **Firebase** để lưu nhật ký dị âm, tạo bộ bệnh án kéo dài nhiều năm.
- **Ứng dụng Mobile:** Lập trình theo kiến trúc **MVVM** tách rời luồng đồ họa (UI) với luồng mạng (Data) giúp nét vẽ nhịp tim siêu mượt mà không bị Crash App.

🗣️ **Lời thoại trình bày:** 
*"Để Bác sĩ trực tuyến ở bệnh viện từ xa xem được, em chia làm 2 đường. Đường kết nối Live là WebSocket chạy với độ trễ thấp nhắt. Nhánh lưu trữ hồ sơ nhiều năm em tống lên Firebase Database. Còn App điện thoại thiết kế theo kiến trúc MVVM tách biệt nhân vẽ đồ họa trên 1 Thread riêng tránh tối đa hiện tượng thắt cổ chai khi nhận cả tấn dữ liệu."*

---

## SLIDE 7: KẾ HOẠCH TRIỂN KHAI VÀ QUẢN LÝ TIẾN ĐỘ (TIMELINE)
Dự án được triển khai gối đầu liên tục trong 15 - 20 tuần:
- **Phase 1 (Tuần 1-4):** Chốt khối linh kiện, mạch nền; thử thành công luồng đọc File thô trên Board cắm.
- **Phase 2 (Tuần 5-10):** Code lõi thuật toán DSP, luyện xong model AI và hạ cấp để Embed vào phần cứng thành công.
- **Phase 3 (Tuần 11-14):** Build hệ sinh thái Cloud và lập trình hoàn thiện thiết kế App. Ghép 3 thành phần thông luồng data.
- **Phase 4 (Tuần 15-18):** Từ thuật toán chốt xong, bóc tách ra vẽ thiết kế PCB, đặt mạch in, gia công hộp 3D bọc silicon.
- **Phase 5 (Tuần 19-20):** Lập file log đánh giá F1-score trên tình nguyện viên thật và nộp đồ án.

🗣️ **Lời thoại trình bày:** 
*"Em tiếp cận dự án theo mô hình Agile từng phần. Đặc biệt em không vội đi làm mạch in hay in 3D vỏ ngay vì rủi ro vứt đi rất lớn. Em sẽ code, chạy mô hình, làm app chán chê trên các board cắm sẵn để tối ưu thuật toán. Ở pha sát cuối, mạch ổn định 100% thì em mới thiết kế và đặt xưởng gia công PCB và in 3D vỏ máy rồi nạp vào."*

---

## SLIDE 8: DỰ KIẾN KẾT QUẢ ĐẠT ĐƯỢC
1. **Thiết bị Vật lý hoàn chỉnh:** Hoạt động độc lập bằng Pin, phát rò qua cảnh báo OLED và kết nối được App. Xử lý tại mép mạng (On-device Inference).
2. **App Ống nghe từ xa:** Bác sĩ truy cập bắt được dao động PCG real-time với độ nhiễu loạn băng thông và lệch pha $~0%$. Thể hiện sự ứng dụng cao trong y tế kĩ thuật số.
3. **Mô hình AI bảo vệ:** Giải quyết bài toán nhận diện bệnh mà tiêu thụ RAM phần cứng tối thiếu nhờ Kỹ thuật Lượng tử hóa mô hình. Đạt độ chính xác trong y khoa mục tiêu $>90\%$.

🗣️ **Lời thoại trình bày:** 
*"Kết quả cuối khóa luận của em không chỉ là hệ thống chạy được mà còn phải chạy đạt chuẩn thiết kế Y Tế Số. Nó phải lọc được tạp âm, phải nén được AI vào con chip bé tẹo RAM chưa tới 500KB mà vẫn phân tích đúng cái tiếng thở khè khè của phổi viêm hay tiếng xào ở tim hở van với độ F1-score kì vọng trên 90%."*

---

## SLIDE 9: KẾT LUẬN & HỎI ĐÁP
- **Em xin chân thành cảm ơn Thầy/Cô đã lắng nghe đề xuất.**
- Rất mong nhận được sự góp ý chấn chỉnh về mặt kĩ thuật để em được phép bắt tay vào triển khai dự án!

🗣️ **Lời thoại trình bày:** 
*"Dạ bài thuyết trình vạch kế hoạch thực hiện của em đến đây là hết, cảm ơn Thầy/Cô đã lắng nghe ý tưởng này. Xin mời Giảng viên cho ý kiến và câu hỏi ạ."*
