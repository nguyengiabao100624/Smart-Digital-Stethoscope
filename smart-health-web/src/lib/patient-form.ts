import type { Patient } from "./smart-health-api";
import type { PatientMutationIntent } from "./patient-operations";

export type PatientFormData = {
  name: string;
  patientCode: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  bloodType: string;
  allergies: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  notes: string;
};

export const EMPTY_PATIENT_FORM: PatientFormData = {
  name: "",
  patientCode: "",
  dateOfBirth: "",
  gender: "male",
  phone: "",
  email: "",
  address: "",
  bloodType: "",
  allergies: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelationship: "",
  notes: "",
};

export function patientFormFromRecord(
  patient?: Patient | null,
): PatientFormData {
  if (!patient) return { ...EMPTY_PATIENT_FORM };
  return {
    name: patient.name || "",
    patientCode: patient.patientCode || "",
    dateOfBirth: patient.dateOfBirth || "",
    gender: patient.gender || "male",
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    bloodType: patient.bloodType || "",
    allergies: patient.allergies?.join(", ") || "",
    emergencyName: patient.emergencyContact?.name || "",
    emergencyPhone: patient.emergencyContact?.phone || "",
    emergencyRelationship: patient.emergencyContact?.relationship || "",
    notes: patient.notes || "",
  };
}

export function patientIntentFromForm(
  form: PatientFormData,
  patientId?: string,
): PatientMutationIntent {
  return {
    patientId,
    name: form.name,
    patientCode: form.patientCode,
    dateOfBirth: form.dateOfBirth,
    gender: form.gender,
    phone: form.phone,
    email: form.email,
    address: form.address,
    bloodType: form.bloodType,
    allergies: Array.from(
      new Set(
        form.allergies
          .split(/[\n,;]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ),
    emergencyContact: {
      name: form.emergencyName,
      phone: form.emergencyPhone,
      relationship: form.emergencyRelationship,
    },
    notes: form.notes,
  };
}

export function patientPayloadFromIntent(intent: PatientMutationIntent) {
  return {
    name: intent.name.trim(),
    patientCode: intent.patientCode?.trim() || "",
    dateOfBirth: intent.dateOfBirth,
    gender: intent.gender,
    phone: intent.phone.trim(),
    email: intent.email?.trim() || "",
    address: intent.address?.trim() || "",
    bloodType: intent.bloodType?.trim() || "",
    allergies: intent.allergies,
    emergencyContact: {
      name: intent.emergencyContact.name.trim(),
      phone: intent.emergencyContact.phone.trim(),
      relationship: intent.emergencyContact.relationship.trim(),
    },
    notes: intent.notes?.trim() || "",
  };
}

export function validatePatientForm(form: PatientFormData) {
  const errors: Partial<Record<keyof PatientFormData, string>> = {};
  if (!form.name.trim()) errors.name = "Vui lòng nhập họ và tên.";
  if (!form.dateOfBirth) {
    errors.dateOfBirth = "Vui lòng chọn ngày sinh.";
  } else {
    const date = new Date(`${form.dateOfBirth}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== form.dateOfBirth ||
      date.getTime() > Date.now()
    ) {
      errors.dateOfBirth = "Ngày sinh không hợp lệ hoặc nằm trong tương lai.";
    }
  }
  const phoneDigits = form.phone.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    errors.phone = "Số điện thoại cần từ 8 đến 15 chữ số.";
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Email chưa đúng định dạng.";
  }
  const hasEmergency = Boolean(
    form.emergencyName.trim() ||
    form.emergencyPhone.trim() ||
    form.emergencyRelationship.trim(),
  );
  if (hasEmergency) {
    if (!form.emergencyName.trim())
      errors.emergencyName = "Cần nhập tên người liên hệ.";
    if (form.emergencyPhone.replace(/\D/g, "").length < 8) {
      errors.emergencyPhone = "Số liên hệ khẩn cấp chưa hợp lệ.";
    }
    if (!form.emergencyRelationship.trim()) {
      errors.emergencyRelationship = "Cần ghi mối quan hệ với bệnh nhân.";
    }
  }
  return errors;
}
