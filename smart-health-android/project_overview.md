# [cite_start]PHIẾU ĐĂNG KÝ KHÓA LUẬN TỐT NGHIỆP [cite: 2]
(Đồ án tốt nghiệp/Báo cáo tốt nghiệp) [cite_start][cite: 3]

[cite_start]**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM** [cite: 1]
[cite_start]**Độc lập - Tự do - Hạnh phúc** [cite: 1]
*Tp. [cite_start]Hồ Chí Minh, ngày 25 tháng 04 năm 2026.* [cite: 1]

## THÔNG TIN CHUNG
* [cite_start]**Bộ môn:** Hệ thống thông minh [cite: 4]
* [cite_start]**Tên đề tài:** Nghiên cứu và thiết kế hệ thống ống nghe điện tử thông minh tích hợp Edge AI hỗ trợ chẩn đoán y tế từ xa [cite: 5]
* [cite_start]**Chuyên Ngành:** IOT VÀ TRÍ TUỆ NHÂN TẠO ỨNG DỤNG [cite: 6]

## THÔNG TIN NHÂN SỰ
[cite_start]**Sinh viên thực hiện:** [cite: 7]
1. [cite_start]Họ và tên: NGUYỄN QUANG DANH - Mã sinh viên: 22705251 [cite: 8]
   * [cite_start]Email: danhnptho.word284@gmail.com - Số điện thoại: 0917175947 [cite: 9]
2. [cite_start]Họ và tên: NGUYỄN GIA BẢO - Mã sinh viên: 22717061 [cite: 10]
   * [cite_start]Email: nguyengiabao100624@gmail.com - Số điện thoại: 0986002210 [cite: 11]

[cite_start]**Người hướng dẫn:** [cite: 12]
* [cite_start]Họ và tên: PHẠM VIỆT THÀNH - Học vị/Học hàm: Tiến sĩ [cite: 13]
* [cite_start]Đơn vị công tác: Khoa công nghệ điện tử [cite: 14]
* [cite_start]Ngày nhận đề tài: 24/03/2026 - Ngày hoàn thành (dự kiến): [Trống] [cite: 15]

---

# [cite_start]MÔ TẢ VÀ KẾ HOẠCH THỰC HIỆN ĐỀ TÀI [cite: 17]
(Đồ án tốt nghiệp/Báo cáo tốt nghiệp) [cite_start][cite: 18]

## [cite_start]1. MÔ TẢ ĐỀ TÀI [cite: 25]

### a. [cite_start]Cơ sở lý thuyết [cite: 26]
* [cite_start]**Vật lý âm học và thu nhận tín hiệu:** Hệ thống sử dụng cảm biến micrô để thu nhận các âm thanh phát ra từ tim và phổi. [cite: 27] [cite_start]Tín hiệu âm thanh thu được sẽ được chuyển đổi sang dạng số để vi điều khiển có thể xử lý trực tiếp, giúp hạn chế nhiễu từ môi trường bên ngoài. [cite: 28]
* [cite_start]**Xử lý tín hiệu Số:** Dữ liệu âm thanh số thô ban đầu sẽ được vi điều khiển nhân và đưa qua các bộ lọc số để loại bỏ tạp âm và nhiễu từ môi trường. [cite: 29] [cite_start]Tiếp đó, hệ thống sử dụng các thuật toán để trích xuất ra những đặc trưng âm thanh quan trọng nhất, làm cơ sở dữ liệu sạch cho quá trình phân tích bệnh lý. [cite: 30]
* [cite_start]**Điện toán biên và trí tuệ nhân tạo:** Vi điều khiển trên thiết bị sẽ xử lý dữ liệu trực tiếp tại chỗ. [cite: 31] [cite_start]Ứng dụng một mô hình học máy đã được huấn luyện sẵn với kích thước nhỏ gọn, cài đặt nhúng trực tiếp lên vi điều khiển để tự động nhận diện, phân loại các âm thanh bình thường hoặc bất thường của tim, phổi sơ bộ ngay trên thiết bị. [cite: 32]
* [cite_start]**Truyền thông và lưu trữ:** Dữ liệu âm thanh thời gian thực và kết quả chẩn đoán sơ bộ được truyền qua kết nối mạng đến ứng dụng trên điện thoại để bác sĩ có thể nghe và quan sát theo thời gian thực. [cite: 33] [cite_start]Dữ liệu này cũng được đồng bộ lên nền tảng đám mây để lưu trữ thành hồ sơ bệnh án lâu dài. [cite: 34]

### b. [cite_start]Khả năng ứng dụng thực tiễn [cite: 35]
* [cite_start]**Nền tảng y tế từ xa:** Xóa bỏ rào cản địa lý, cho phép các bác sĩ ở xa có thể trực tiếp nghe lại âm thanh tim, phổi và quan sát biểu đồ của bệnh nhân theo thời gian thực, hỗ trợ quá trình hội chẩn để đưa ra các tư vấn kịp thời ở xa mà không cần tiếp xúc trực tiếp. [cite: 36]
* [cite_start]**Sàng lọc bệnh lý tự động:** Đóng vai trò như một công cụ hỗ trợ y tế tuyến cơ sở (sơ bộ), giúp tự động phát hiện sớm một số dấu hiệu bất thường của tim và phổi mà tai người có thể bỏ sót. [cite: 37] (Ví dụ: Tiếng cọ màng tim, tiếng Rales ran ở phổi, các dải tạp âm murmurs tần số thấp)[cite_start]. [cite: 38]
* [cite_start]**Chuẩn hóa hồ sơ bệnh án điện tử:** Nền tảng được tổ chức và lưu trữ trên hệ sinh thái đám mây. [cite: 39] [cite_start]Dữ liệu này giúp hình thành chuỗi bệnh án lịch sử cho từng bệnh nhân dựa trên các mốc thời gian và ghi nhận dị âm bất thường. [cite: 40] [cite_start]Qua đó hỗ trợ bác sĩ dễ dàng truy xuất và theo dõi sát sao tiến triển bệnh trong thời gian dài và cung cấp nguồn dữ liệu quý giá phục vụ nghiên cứu y khoa. [cite: 41]

### c. [cite_start]Sản phẩm dự kiến [cite: 42]

| STT | Sản phẩm dự kiến | Mô tả |
| :--- | :--- | :--- |
| 1 | [cite_start]Phần cứng (Hardware) [cite: 43] | 01 thiết bị nghe điện tử thông minh hoàn thiện. [cite_start]Bao gồm: đầu thu âm, hộp xử lý trung tâm, màn hình hiển thị thông số cơ bản và vỏ bọc thiết bị. [cite: 43] |
| 2 | [cite_start]Phần mềm (Software/Cloud) [cite: 43] | [cite_start]01 ứng dụng di động để hiển thị biểu đồ âm thanh thời gian thực và lưu trữ dữ liệu đám mây. [cite: 43] |
| 3 | [cite_start]Thuật toán & AI [cite: 43] | [cite_start]01 mô hình học máy được tích hợp trực tiếp trên thiết bị (Edge AI), có khả năng phân loại và dự đoán bệnh lý cơ bản từ dữ liệu âm thanh. [cite: 43] |
| 4 | [cite_start]Trợ lý ảo (Chatbot) [cite: 43] | [cite_start]01 Chatbot trên ứng dụng di động giúp hỗ trợ giải thích kết quả và tư vấn hướng dẫn sử dụng thiết bị. [cite: 43] |
| 5 | [cite_start]Báo cáo khoá luận [cite: 43] | [cite_start]Tài liệu phân tích, thiết kế hệ thống và đánh giá kết quả thực nghiệm. [cite: 43] |

## [cite_start]2. KẾ HOẠCH THỰC HIỆN ĐỀ TÀI (Dự kiến) [cite: 44]

| STT | Công việc thực hiện | Sản phẩm đầu ra | Sinh viên thực hiện | Thời gian (Dự kiến) |
| :--- | :--- | :--- | :--- | :--- |
| 1 | [cite_start]Nghiên cứu tài liệu (y văn, kỹ thuật), lập đề cương thiết kế và đặt mua các mạch phát triển (Dev board, cảm biến). [cite: 45] | [cite_start]Bản sơ đồ khối, danh sách linh kiện [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 1 - Tuần 2 [cite: 45] |
| 2 | [cite_start]Lắp ráp mạch thử nghiệm, lập trình chức năng thu thập và đọc dữ liệu âm thanh số. [cite: 45] | [cite_start]Mạch thử nghiệm cơ bản chạy được code đọc âm thanh [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 3 - Tuần 4 [cite: 45] |
| 3 | [cite_start]Lập trình chức năng lọc nhiễu tín hiệu âm thanh và hiển thị thông số lên màn hình thiết bị. [cite: 45] | [cite_start]Code xử lý tín hiệu, giao diện màn hình trên thiết bị [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 5 - Tuần 6 [cite: 45] |
| 4 | [cite_start]Thu thập dữ liệu âm thanh mẫu và tiến hành huấn luyện mô hình học máy phân loại cơ bản. [cite: 45] | [cite_start]Mô hình trí tuệ nhân tạo cơ bản đã được huấn luyện [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 7 - Tuần 8 [cite: 45] |
| 5 | [cite_start]Tối ưu hóa kích thước mô hình học máy và cài đặt thử nghiệm lên vi điều khiển. [cite: 45] | [cite_start]Thuật toán chạy ổn định trên vi điều khiển [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 9 - Tuần 10 [cite: 45] |
| 6 | [cite_start]Cấu hình cơ sở dữ liệu lưu trữ đám mây và thiết kế giao diện cho ứng dụng điện thoại. [cite: 45] | [cite_start]Cơ sở dữ liệu, bản thiết kế giao diện ứng dụng [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 11 - Tuần 12 [cite: 45] |
| 7 | [cite_start]Lập trình ứng dụng điện thoại, kết nối đồng bộ dữ liệu giữa thiết bị, đám mây và ứng dụng. [cite: 45] | [cite_start]Ứng dụng điện thoại hoạt động và nhận được dữ liệu [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 13 - Tuần 14 [cite: 45] |
| 8 | [cite_start]Thiết kế bản vẽ mạch in thực tế và thiết kế bản vẽ vỏ hộp ngoài cho thiết bị. [cite: 45] | [cite_start]Bản vẽ mạch in, file thiết kế vỏ hộp 3D [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 15 - Tuần 16 [cite: 45] |
| 9 | [cite_start]Đặt gia công, hàn linh kiện và lắp ráp hoàn thiện thiết bị ống nghe điện tử. [cite: 45] | [cite_start]Thiết bị phần cứng hoàn chỉnh [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 17 - Tuần 18 [cite: 45] |
| 10 | [cite_start]Chạy thử nghiệm hệ thống, kiểm tra độ ổn định và thu thập dữ liệu đánh giá thực tế. [cite: 45] | [cite_start]Bảng đánh giá kết quả hoạt động của thiết bị [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 19 [cite: 45] |
| 11 | [cite_start]Hoàn thiện cuốn báo cáo khóa luận, làm slide thuyết trình và quay video chạy thử sản phẩm. [cite: 45] | [cite_start]Cuốn báo cáo KLTN, Slide PPT, Video tình huống [cite: 45] | [cite_start]Nguyễn Gia Bảo, Nguyễn Quang Danh [cite: 45] | [cite_start]Tuần 20 [cite: 45] |