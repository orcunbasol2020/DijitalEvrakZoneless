export interface NavigationModel {
    title?: string;
    url?: string;
    icon?: string;
    roles?: string[];
    excludeRoles?: string[];
    category?: string;
}

/**
 * Havale (AI), parametre sayfaları ve Raporlar'ı görmeyen roller. Menü ve rota
 * koruması (app.routes.ts) aynı listeyi kullanır; sayfa adres yazılarak da açılamaz.
 */
export const LIMITED_ROLES = ["Birim Evrak Sorumlusu", "Birim Yöneticisi", "Ön Kayıt"];

export const navigations: NavigationModel[] = [
    {
        title: "Kontrol Paneli",
        url: "/",
        icon: "dashboard"
    },

    {
        category: "Gelen Evrak",
        title: undefined,
        url: undefined,
        icon: undefined
    },
    {
        title: "Ön Kayıt",
        url: "/onkayit",
        icon: "app_registration",
        roles: ["Gelen Evrak", "Ön Kayıt"]
    },
    {
        title: "Ön Kayıtlar",
        url: "/onkayitlar",
        icon: "pending_actions",
        roles: ["Gelen Evrak", "Ön Kayıt", "Yönetici"]
    },
    {
        title: "Evrak Kayıt",
        url: "/qrokut",
        icon: "qr_code",
        roles: ["Gelen Evrak", "Ön Kayıt"]
    },
    {
        title: "Gelen Evraklar",
        url: "/scanlist",
        icon: "add_notes",
        roles: ["Gelen Evrak"]
    },
    {
        // Birim Evrak Sorumlusu için birim evraklarının hafif listesi; evrak kayıt
        // rolü de olan kullanıcı yukarıdaki tam sürümü görür, bu madde gizlenir.
        // Ön Kayıt yetkisi olan kullanıcı hiçbir "Gelen Evraklar" maddesini görmez.
        title: "Gelen Evraklar",
        url: "/incomingDepartmentDocument",
        icon: "add_notes",
        roles: ["Birim Evrak Sorumlusu", "Birim Yöneticisi"],
        excludeRoles: ["Gelen Evrak", "Ön Kayıt"]
    },
    {
        title: "Gelen Evraklar",
        url: "/documentlist",
        icon: "add_notes",
        roles: ["Yönetici"]
    },
    {
        title: "Taranmış Evraklar",
        url: "/scanneddocument",
        icon: "scanner",
        roles: ["Gelen Evrak"]
    },
    {
        title: "Zimmet",
        url: "/zimmet",
        icon: "contract_edit",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Ön Kayıt"]
    },
    {
        // Rol kısıtı yok: her kullanıcıya evrak devredilebilir
        title: "Zimmet Onayları",
        url: "/zimmet-onaylari",
        icon: "assignment_turned_in"
    },
    {
        title: "Havale (AI)",
        url: "/havale",
        icon: "neurology",
        excludeRoles: LIMITED_ROLES
    },
    {
        title: "OCR Takip",
        url: "/ocrtakip",
        icon: "document_scanner",
        roles: ["Gelen Evrak", "Yönetici"]
    },
    {
        title: "Dijitalleştirme Takip",
        url: "/dijitallestirme-takip",
        icon: "cloud_sync",
        roles: ["Gelen Evrak", "Yönetici"]
    },

    {
        category: "Giden Evrak",
        title: undefined,
        url: undefined,
        icon: undefined
    },
    {
        title: "Giden Evraklar",
        url: "/gidenevrak/outgoing",
        icon: "local_post_office"
    },
    {
        title: "Zarflar",
        url: "/envelope",
        icon: "stacked_email",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Giden Evrak", "Ön Kayıt", "Yönetici"]
    },
    {
        title: "Zarf Etiketi",
        url: "/ticket",
        icon: "book",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Birim Yöneticisi", "Giden Evrak", "Ön Kayıt"]
    },
    {
        title: "Teslim Al / Zimmetle",
        url: "/gidenevrak/zimmet",
        icon: "approval_delegation",
        roles: ["Gelen Evrak", "Giden Evrak", "Ön Kayıt"]
    },
    {
        title: "Kargo Takip",
        url: "/kargo-takip",
        icon: "local_shipping",
        roles: ["Gelen Evrak", "Giden Evrak", "Ön Kayıt", "Yönetici"]
    },

    {
        category: "Kullanıcılar",
        title: undefined,
        url: undefined,
        icon: undefined
    },
    {
        title: "Kullanıcılar",
        url: "/users",
        icon: "diversity_3",
        roles: ["Gelen Evrak", "Yönetici"]
    },
    {
        title: "Dış Kurum Kullanıcıları",
        url: "/externaluser",
        icon: "contact_emergency",
        roles: ["Gelen Evrak"]
    },
    {
        title: "Roller",
        url: "/users/role",
        icon: "security",
        roles: ["Yönetici"]
    },
    {
        title: "Giriş Kayıtları",
        url: "/users/login-logs",
        icon: "history",
        roles: ["Yönetici"]
    },

    {
        category: "Parametreler",
        title: undefined,
        url: undefined,
        icon: undefined
    },
    {
        title: "QR Oluştur",
        url: "/qrlist",
        icon: "qr_code",
        roles: ["Gelen Evrak"]
    },
    {
        title: "Birimler",
        url: "/birimler",
        icon: "apartment",
        excludeRoles: LIMITED_ROLES
    },
    {
        title: "Dış Kurumlar",
        url: "/externalinstitution",
        icon: "moving_ministry",
        excludeRoles: LIMITED_ROLES
    },
    {
        title: "Diller",
        url: "/parameters/languages",
        icon: "language_chinese_array",
        excludeRoles: LIMITED_ROLES
    },
    {
        title: "Raporlar",
        url: "/reports",
        icon: "monitoring",
        excludeRoles: LIMITED_ROLES
    },
    {
        title: "Uygulama Ayarları",
        url: "/app-settings",
        icon: "tune",
        roles: ["Yönetici"]
    }
];