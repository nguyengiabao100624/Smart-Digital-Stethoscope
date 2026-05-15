# KỊCH BẢN LỜI THOẠI VÀ SỔ TAY BẢO VỆ ĐỀ CƯƠNG KLTN
*(Đây là "Phao cứu sinh" để bạn in ra giấy cầm trên tay hoặc xem trên iPad lúc đứng thuyết trình. Nó chỉ chứa LỜI NÓI của bạn và phần GIẢI THÍCH CHI TIẾT để đối đáp tay đôi với Giảng viên)*

---

### SLIDE 1: GIỚI THIỆU
🎙️ **Tự tin thuyết trình:** 
"Kính chào Thầy/Cô và Hội đồng. Hôm nay em xin phép trình bày đề xuất kế hoạch triển khai đề tài dự án Khóa luận tốt nghiệp của em với tên gọi: Thiết kế và chế tạo hệ thống Ống nghe y tế điện tử thông minh tích hợp trí tuệ nhân tạo và hệ sinh thái khám bệnh từ xa Telemedicine."

---

### SLIDE 2: ĐẶT VẤN ĐỀ (TẠI SAO PHẢI LÀM?)
🎙️ **Thuyết trình:** 
"Điểm xuất phát của em đến từ một thực tế điểm yếu của các ống nghe y tế cơ học truyền thống: Nó quá phụ thuộc vào đôi tai và thính lực của người bác sĩ. Lỡ bác sĩ đang mệt, ồn ào hoặc thính lực người già kém, thì rất dễ lọt lưới các tạp âm bệnh nhỏ xíu ở tim (ví dụ tiếng Murmurs) hay ở phổi (tiếng rales). Vì vậy, em quyết tâm số hóa quá trình này để máy móc nghe hộ con người."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Rales hay Murmurs là bệnh gì? Tại sao lại khó nghe?**
  - **Tiếng Rales (Ran vặn ở phổi):** Dạ thưa thầy, nó là âm thanh lép bép lạo xạo như tiếng vò cọ xát lọn tóc ngay sát bên tai, báo hiệu túi khí ở phổi đang có dịch mủ/viêm. 
  - **Tiếng Murmurs (Tiếng thổi ở tim):** Dạ là tiếng thổi do van tim bị hở/thủng/hẹp. Lúc đó máu xịt xuyên qua cái khe nhỏ với áp suất lớn rít lên xèo xèo siêu trầm. Đó chính là 2 cái bệnh phổ biến khó phát hiện nhất mà AI của em sẽ sinh ra để nhận diện thay tai người.

---

### SLIDE 3: MỤC TIÊU CỐT LÕI (LÀ M ĐƯỢC GÌ)
🎙️ **Thuyết trình:** 
"Mục tiêu cốt lõi của đề tài này là em sẽ xây dựng toàn bộ 1 hệ sinh thái 3 tầng công nghệ: Tầng 1 làm ra phần cứng ống nghe IoT; Tầng 2 xây dựng luồng băng thông mạng đám mây siêu tốc; và Tầng 3 thiết kế một App chuẩn y khoa hiển thị màn hình dao động PCG như siêu âm chuyên dành cho bác sĩ."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Em suốt ngày nhắc chữ PCG, vậy PCG là gì? Khác gì cái siêu âm với ECG?**
  - Dạ thưa thầy, ECG (Điện tâm đồ) là dán điện cực đo dòng điện tim để vẽ nét tít tít tít. Còn PCG (Tâm âm đồ - Phonocardiogram) của em là đo bằng **sóng âm thanh cơ học** (tiếng bùm-tặc của tim bơm máu văng dội vào màng nhĩ). Bệnh xập xệ hở van tim hay viêm phổi ran rít chỉ có nghe rung động cơ học mới ra bệnh, chứ ECG bắt điện thì không thể nào chẩn đoán được tiếng rì rào của kẽ hở van.
- **❓ Khám bệnh Telemedicine là làm gì?**
  - Dạ Telemedicine là Y tế Từ xa. Hãy tưởng tượng ông bà cụ ở vùng sâu vùng xa tự cầm ống nghe này úp lên ngực, dữ liệu PCG sẽ được Edge Node bắn thẳng băng qua không gian lên Cloud và hiện luôn trên màn hình điện thoại của Bác sĩ khoa tim mạch ở bệnh viện tuyến Trung Ương. Bác sĩ thấy dao động ngay trực tiếp tại TPHCM và phân tích được bệnh ngay lập tức dù bệnh nhân đang ở Hà Giang. Môi trường đó gọi là Telemedicine.

---

### SLIDE 4: CÔNG NGHỆ LÕI PHẦN CỨNG
🎙️ **Thuyết trình:** 
"Về thiết kế thân máy thiết bị, điểm cốt lõi để chống nhiễu của đề tài là em loại bỏ hoàn toàn các bộ chuyển đổi Analog cũ. Thay vào đó em dùng cổng thu âm số I2S của mic MEMS phóng mã nhị phân thẳng vào chip bằng đường cao tốc DMA không cần CPU can thiệp. Em xài chip Dual-core: nhân 0 chỉ lo ăn data, nhân 1 chạy màn OLED để chống đứng mạch."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Micro MEMS khác gì Micro thường? Tại sao không dùng Analog truyền thống?**
  - Dạ Micro Analog truyền tín hiệu điện li ti theo dây dẫn, bác sĩ chạm tay vào là mồ hôi cơ thể gây ra nhiễu tĩnh điện. Dạ em xài MEMS vì nó đúc bằng vi mạch silicon, chống nhiễu điện cực tốt, giá rẻ, độ nhạy cao.
- **❓ I2S khác gì I2C? Sao không xài I2C I2C cho tiện?**
  - Dạ I2C là giao thức chậm, thích hợp để truyền vài chuỗi chữ xuất màn hình OLED. I2S (Inter-IC Sound) sinh ra ĐỘC QUYỀN chỉ để gánh lượng dữ liệu âm thanh khổng lồ và bắn thẳng định dạng nhị phân 0-1 vào não bộ vi điều khiển.
- **❓ Em ghi là truyền bằng đường cao tốc DMA. Vậy DMA là cái gì? Tại sao bắt buộc phải có?**
  - **Nó là gì:** Dạ thưa thầy, DMA viết tắt của *Direct Memory Access* (Truy cập Bộ nhớ Trực tiếp). Bình thường, khi Micro thu được âm thanh, CPU phải trực tiếp đứng ra gồng mình gắp từng hạt dữ liệu cất vào RAM. 
  - **Cách hoạt động và Ứng dụng trong dự án:** Hiện tại Micro của em đang bắn phá dồn dập vào ESP32 với tốc độ 4000 nhịp/giây. Nếu CPU phải đứng ra gắp 4000 lần mỗi giây, nó sẽ sập nguồn chết ngắc, không còn 1% sức lực nào để chạy AI hay vẽ màn hình OLED. DMA chính là một con chip phụ luồng lách (như băng chuyền tự động). Con chip DMA này sẽ tự động hốt mẻ sóng âm 4000 nhịp đó ném thẳng vào kho RAM ở chế độ chạy ngầm (Background). Khi nào kho RAM đầy, thằng DMA mới khều vai gọi CPU: "Dữ liệu gom xong rồi nè, thày đem đi xử lý AI đi". Nhờ có DMA, con CPU của em rảnh rang 100% sức lực để làm tính toán thuật toán ạ.
- **❓ Em căn cứ vào đâu mà chọn tần số thu sóng? (Định lý Nyquist)**
  - Dạ em dựa theo định lý Nyquist là quy chuẩn của xử lý tín hiệu DSP. Tốc độ thu mẫu phải nhanh gấp ĐÔI tần số cao nhất của âm thanh cần thu. Âm thanh bệnh lý tim/phổi chốt chặn thấp hơn $1000\text{Hz}$. Vậy em thiết lập tần số $f_s = 4000\text{Hz}$ trong phần mềm là để lấy biên độ an toàn gấp 4 lần, bắt trọn từng hạt nhiễu nhỏ nhất.
- **❓ FreeRTOS em dùng trên phần cứng là cái gì? Không có xài code vòng lặp bình thường được không?**
  - Dạ FreeRTOS là Hệ điều hành thời gian thực thu nhỏ (Dành riêng cho chip IoT). Bình thường viết hàm `loop()` cho vi điều khiển là nó chạy tuần tự từ A đến Z, chờ xong việc này mới tới việc kia. Nhưng dự án của em phải hứng đợt sóng Data nhồi như súng liên thanh (4000 hạt/giây), nếu chạy tuần tự, chip sẽ treo đứng hình. FreeRTOS biến con CPU của em thành mọc ra nhiều luồng đa nhiệm (Multi-tasking), giao công việc hứng data ở Thread 1, vẽ màn hình Thread 2, gửi Wifi Thread 3 hoạt động đồng thời cách ly song song không luồng nào dẫm chân lên luồng nào.

---

### SLIDE 5: THUẬT TOÁN DSP & TINY ML
🎙️ **Thuyết trình:** 
"Ngay trên chip ESP32, thay vì vứt hết data cho Laptop hay Cloud phân tích tốn tiền mạng, em sẽ áp dụng Edge AI - Điện toán ngay tại mép mạng biên. Tín hiệu thô sẽ qua bộ lọc Bandpass, được vuốt cong mịn màng 2 đầu bằng hàm cửa sổ Hamming. Luồng này tiếp tục chảy qua hàm MFCC để ép nén ra 13 đặc trưng. AI sau khi đã được em Lượng tử hóa Quantization sẽ tức khắc dùng 13 đặc trưng vân tay kia xem bói ra bệnh tại chỗ luôn thưa Hội đồng."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Lúc thì em dùng miền Thời Gian, lúc thì nhắc quy đổi FFT. FFT là gì và tại sao biến đổi làm gì cho mệt xác?**
  - Dạ thưa thầy, FFT (Fast Fourier Transform - Biến đổi Fourier Nhanh) giống như một cái lăng kính xoay góc nhìn. Sóng âm thanh lúc thu vô được vẽ theo trục vệt dài thời gian dập dềnh; nhìn bằng mắt thì sướng, nhưng đưa nó cho AI học thì AI bị tẩu hỏa nhập ma ko biết đâu là điểm nhấn. Hàm toán học FFT đập nát cái sóng thời gian đó chuyển qua trục "Tần Số" (nghĩa là nó lọc ra rành rọt dải âm phổ này được pha trộn bởi bao nhiêu nốt trầm, bao nhiêu âm the thé nốt cao). Nắm được chuỗi tần số đó, AI mới ngửi được bệnh trúng phóc 100%.
- **❓ Cửa sổ Hamming rốt cuộc là cái gì? Không có nó thì sao?**
  - Dạ mạch phân tích máy tính không nuốt được nguyên 1 câu âm thanh dài, nó phải băm nhuyễn sóng ra ngàn mảnh miligiây. Vết cắt đó là đường vuông góc, nó gây lỗi số học gọi là "Nhiễu rò rỉ phổ". Công thức Hamming có tác dụng chèn nắn 2 mép đầu cuối của vết cắt cong chúi về mốc 0 mịn màng. Không có nó AI sẽ báo sai.
- **❓ MFCC (Mel Cepstrum) là gì? Đưa âm thanh thẳng vào AI không được à?**
  - Dạ thưa đưa sóng thô vào AI thì nổ dữ liệu RAM chết ngay. Hàm MFCC sinh ra là để xử lý sóng nhiễu đó. Tại sao có chữ Mel? Là vì thính giác của con người là đường cong phi tuyến (chuộng dải âm trầm hơn âm cao). Mel mô phỏng lại cách nghe của tai Bác sĩ. Biến đổi Cepstrum gọt dũa nguyên mớ sóng khổng lồ thành đúng DUY NHẤT 13 con số (vector). 13 con số này chứa trọn vẹn AND của cái nhịp tim đó. Hệ thống nhẹ đi ngàn lần.
- **❓ Lượng tử hóa (Quantization) là sao?**
  - Dạ AI huấn luyện trên Laptop là tệp vĩ đại nặng chục MB dùng số thực Float32 (32-bit). Con chip ESP32 nhét AI đó vào là Tràn RAM (Memory Overflow) ngủm củ tỏi ngay. Lượng tử hóa là dùng kĩ thuật ép số, làm tròn từ Float32bit xuống tệp số nguyên Int8bit. AI bị thu nhỏ đi 4-5 lần nhưng cực kì tương thích với thiết bị IoT nghèo bộ nhớ.
- **❓ Tại sao em xài Rừng ngẫu nhiên (Random Forest/Quyết định) cổ hủ mà không xài thuật toán mạng nơ rôn xịn bự như Deep Learning CNN?**
  - Dạ thưa dùng dao mổ trâu không thể lột vỏ gà được ạ. Deep Learning rất xịn để nhìn cái bức ảnh Tim phổi lớn, nhưng lại ngốn phần cứng và tản nhiệt khổng lồ, không nhét vô chip ESP32 bằng pin Cúc áo được. Đề tài của em đi vòng bằng trí thông minh: em nhờ MFCC ép sóng thô thành 1 bộ Vector số lượng tí hon rồi (dạng Tabular Data). Random Forest chính là Vị Vua độc tôn mạnh vô song khi đọc dữ liệu bảng số, độ chính xác yếm thế mà cực kì nhẹ nhàng chạy cực ngọt. Hơn nữa Rừng ngẫu nhiên minh bạch thuật toán chẩn đoán, em bốc mã nguồn ra thầy xem nhánh nào cây nào dẫn tới kết loạn bệnh lý được luôn, chứ dùng Deep Learning nó là Hộp Đen chẩn đoán em lấy dữ liệu y tế sao độ tin cậy Thầy Câm được ạ.

---

### SLIDE 6: KẾT NỐI APP & ĐÁM MÂY CLOUD
🎙️ **Thuyết trình:** 
"Để Bác sĩ trực tuyến xem được từ xa, em rạch làm 2 đường ống. Đường chẩn đoán Live là em cắm cọc WebSocket giúp gọi Video Live dữ liệu sóng tim mà không hề có delay tải lại trang. Nhánh thứ 2 để làm Kho lưu bệnh án vĩnh viễn (EHR) thì em đẩy lên Firebase. Và trên App điện thoại, em dùng kiến trúc đặc biệt MVVM tách nhân vẽ luồng đồ họa riêng, tránh đứng hình App giật lag khi nhận cả triệu xung nhịp."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Sao vẽ chuyện xài cả 2 là WebSocket và Firebase? 1 cái thôi?**
  - Dạ thưa thầy Firebase là CƠ SỞ DỮ LIỆU. Mình ghi File dữ liệu lên đó phải chờ đồng bộ cực kì trễ (delay tĩnh tới vài giây). Nó chỉ xài lưu Hồ sơ bệnh án tĩnh nguội lạnh. Kế hoạch ống nghe của em là Telemedicine - Cứ bệnh nhân dưới tỉnh đập 1 nhịp tim, là tai Bác sĩ trung ương nảy 1 nhịp. Cực kì trực tiếp. Cái đó chỉ thằng WebSocket với kênh mở liên tục trực diện (Độ trễ mili-giây) mới gánh được ạ. Em gom cả 2 vào để hỗ trợ khiếm khuyết cho nhau.
- **❓ Kiến trúc MVVM chống Deadlock (Thắt cổ chai) ra sao?**
  - Dạ App phải chạy ngầm Backgound nhận 4000 nhịp sóng nã tới mỗi giây. Mà cùng lúc đó màn hình điện thoại đang phải căng sức vẽ cái sóng chớp chớp y như trên tivi bệnh viện. Nếu trộn chung 2 luồng này nó sẽ bóp cổ nhau, tràn luồng và chết Crash ứng dụng (ANR hay Deadlock). MVVM cách ly lớp View (Vẽ) và Model (Nhận data). Thằng vẽ cứ vẽ ở luồng chính, thằng nhận cứ xúc data ở luồng phụ, cực kì mượt mà.

---

### SLIDE 7: KẾ HOẠCH BỐ TRÍ KHUNG THỜI GIAN
🎙️ **Thuyết trình:** 
"Kế hoạch triển khai của em được băm thành 5 tháng cuốn chiếu: Tháng 1 mua đồ và cắm test; Tháng 2 nạp Code ESP32; Tháng 3 tập trung cực độ cho giải thuật Toán và dồn AI; Tháng 4 viết App Android và Cloud. Riêng khâu Vẽ hộp 3D, khắc mạch in PCB chuyên nghiệp em đẩy hết độ khó xuống Tháng 5. Nếu Test mạch cắm mượt mà từ trước rồi thì mạch PCB và vỏ 3D ráp vô là khớp ăn ngay."

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Sao phần cứng 3D và PCB quan trọng lại bỏ tuốt dưới Tháng 5 mới làm?**
  - Dạ đây là tư duy kỹ sư an toàn (Agile). Việc thiết kế hộp và in board mạch PCB tốn kém, khó sửa, rủi ro vô cùng cao nếu đặt kích thước sai lỗ. Do đó em phải cắm trên Board nháp (Breadboard) để nhào nặn sạch sẽ Bug và rác Phần mềm thuật toán trước. Khi Firmware hoàn hảo 100% không còn giật lag, em mới chuyển giao qua đặt in PCB, nhồi code vô. Như vậy bảo đảm 1 nhát ăn ngay thưa thầy.

---

### SLIDE 8 + 9: DỰ KIẾN KẾT QUẢ VÀ KẾT THÚC
🎙️ **Thuyết trình:** 
"Sản phẩm tụi em làm ra sẽ không chỉ là mô hình nhựa chạy được, mà là một chuẩn thiết bị Y Tế Số đúng nghĩa. Nó lọc tạp âm, nhúng ép bằng được AI phân loại tiếng xào của phổi vô board mạch siêu nhỏ gọn chạy bằng pin; truyền phát xa mà độ trễ cực thấp. Độ chính xác lâm sàng kì vọng của em phải trên 90%.

Dạ bài thuyết trình kế hoạch thực hiện của em đến đây là hết. Xin chân thành cảm ơn Hội đồng Giảng viên hướng dẫn đã ưu ái lắng nghe ngọn nguồn các ý tưởng ạ. Xin kính mời Thầy/Cô cho em câu hỏi đóng góp thêm để em có thể bắt tay tiến hành ạ!"

💡 **BỘ PHÒNG THỦ CHI TIẾT (Nếu thầy vặn hỏi):** 
- **❓ Ủa sao đánh giá mức độ tin cậy AI em không đo 'Độ chính xác' bằng Tỷ lệ phần trăm (Accuracy), mà em dùng cái phức tạp là điểm F1-Score làm gì?**
  - Dạ thưa thầy, nếu chơi cái trò đo đánh giá Accuracy trong dữ liệu Y tế bệnh học là một cái bẫy chết người. Ví dụ một tập mẫu bệnh viện thu có 99 người khỏe mạnh và vô tình chỉ có được 1 người bị bệnh thôi. Giả sử con AI của em bị "Đuôi Lờ" (Bị hỏng kĩ năng phân lô), nó cứ thế nhắm mắt phán bừa: "100 ông này Tất cả siêu khỏe mạnh!". Lúc này đem đo Accuracy điểm bài thi là 99% (Giỏi xáo xào) ! Điều này cực kỳ nguy hiềm với Y học vì bị Sót hoàn toàn 1 bệnh nhân Nhồi máu cơ tim.
  - Do đó để chốt hạ, em xài chuẩn điểm F1-Score (nó là cân bằng âm dương Trung bình điều hòa của Precision và Recall). Điểm F1-Score nó sẽ đánh rớt ngay con AI nào lười biếng phán bừa. Nó ép AI phải nhận trúng người có bệnh bất biến số mẫu và tuyệt đối hạn chế "nhận vơ" người bình thường thành người bệnh. Kì vọng em vượt qua cái mốc F1-score > 90% tức sự xuất sắc nhất thưa thầy.
