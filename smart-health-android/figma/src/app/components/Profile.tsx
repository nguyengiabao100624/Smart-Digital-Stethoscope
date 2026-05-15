import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Building,
  IdCard,
  Edit,
  Camera,
  Save,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function Profile() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    name: 'Nguyễn Tuấn',
    title: 'Bác sĩ Tim mạch',
    id: '89432',
    license: '123456/BYT-CCHN',
    email: 'bacsituan@benhvien.com',
    phone: '', // Để trống để demo chức năng thêm số điện thoại
    hospital: 'Bệnh viện Đa khoa Trung ương',
    department: 'Khoa Tim mạch',
    address: '123 Đường Láng, Đống Đa, Hà Nội',
    joinDate: '15/03/2020',
  });

  const [tempChanges, setTempChanges] = useState<{
    email?: string;
    phone?: string;
  }>({});

  const handleSave = () => {
    // Kiểm tra xem có thay đổi email hoặc số điện thoại không
    const originalEmail = 'bacsituan@benhvien.com';
    const originalPhone = '0912 345 678';

    if (profile.email !== originalEmail) {
      // Yêu cầu xác thực email mới
      navigate(`/re-verify?type=email&contact=${encodeURIComponent(profile.email)}`);
      return;
    }

    if (profile.phone !== originalPhone) {
      // Yêu cầu xác thực số điện thoại mới
      navigate(`/re-verify?type=phone&contact=${encodeURIComponent(profile.phone)}`);
      return;
    }

    // Nếu không có thay đổi email/phone, lưu bình thường
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 pb-20 shadow-md">
        <div className="flex items-center justify-between text-white mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold">Thông tin cá nhân</h1>
          </div>
          <button
            onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
            className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/30 hover:bg-white/30 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            {isEditing ? (
              <>
                <Save className="w-4 h-4" />
                Lưu
              </>
            ) : (
              <>
                <Edit className="w-4 h-4" />
                Chỉnh sửa
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-[#0B5C9A] text-3xl font-bold shadow-lg">
              NT
            </div>
            {isEditing && (
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center text-[#0B5C9A] shadow-lg border-2 border-[#0B5C9A]">
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>
          <h2 className="text-white font-semibold text-xl mt-4">{profile.name}</h2>
          <p className="text-white/80 text-sm font-medium">
            {profile.title} • ID: {profile.id}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 -mt-12 pb-6 overflow-y-auto">
        <div className="bg-white rounded-2xl border border-border shadow-lg p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
              Thông Tin Chuyên Môn
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#0B5C9A]/10 rounded-lg mt-1">
                  <IdCard className="w-5 h-5 text-[#0B5C9A]" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Số chứng chỉ hành nghề
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.license}
                      onChange={(e) =>
                        setProfile({ ...profile, license: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]"
                    />
                  ) : (
                    <p className="text-foreground font-medium mt-1">{profile.license}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg mt-1">
                  <Building className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Cơ sở y tế
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.hospital}
                      onChange={(e) =>
                        setProfile({ ...profile, hospital: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]"
                    />
                  ) : (
                    <p className="text-foreground font-medium mt-1">{profile.hospital}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg mt-1">
                  <User className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Khoa</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={profile.department}
                      onChange={(e) =>
                        setProfile({ ...profile, department: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]"
                    />
                  ) : (
                    <p className="text-foreground font-medium mt-1">{profile.department}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
              Thông Tin Liên Hệ
            </h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg mt-1">
                  <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Email</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) =>
                        setProfile({ ...profile, email: e.target.value })
                      }
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]"
                    />
                  ) : (
                    <p className="text-foreground font-medium mt-1">{profile.email}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg mt-1">
                  <Phone className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Số điện thoại
                  </label>
                  {profile.phone ? (
                    <>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={profile.phone}
                          onChange={(e) =>
                            setProfile({ ...profile, phone: e.target.value })
                          }
                          className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]"
                        />
                      ) : (
                        <p className="text-foreground font-medium mt-1">{profile.phone}</p>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => navigate('/verify-phone-settings')}
                      className="text-[#0B5C9A] text-sm font-medium hover:underline mt-1"
                    >
                      + Thêm số điện thoại
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-pink-500/10 rounded-lg mt-1">
                  <MapPin className="w-5 h-5 text-pink-500" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Địa chỉ</label>
                  {isEditing ? (
                    <textarea
                      value={profile.address}
                      onChange={(e) =>
                        setProfile({ ...profile, address: e.target.value })
                      }
                      rows={2}
                      className="w-full mt-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] resize-none"
                    />
                  ) : (
                    <p className="text-foreground font-medium mt-1">{profile.address}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#00A896]/10 rounded-lg mt-1">
                  <Calendar className="w-5 h-5 text-[#00A896]" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Ngày tham gia
                  </label>
                  <p className="text-foreground font-medium mt-1">{profile.joinDate}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
