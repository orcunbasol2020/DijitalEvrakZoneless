export interface NavigationModel {
    title?: string;
    url?: string;
    icon?: string;
    roles?: string[];
    excludeRoles?: string[];
    category?: string;
}

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
        roles: ["Gelen Evrak"]
    },
    {
        title: "Evrak Kayıt",
        url: "/qrokut",
        icon: "qr_code",
        roles: ["Gelen Evrak"]
    },
    {
        title: "Gelen Evraklar",
        url: "/scanlist",
        icon: "add_notes",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu"]
    },
    {
        title: "Gelen Evraklar",
        url: "/documentlist",
        icon: "add_notes",
        roles: ["Yönetici"]
    },
    {
        title: "Zimmet",
        url: "/zimmet",
        icon: "contract_edit",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu"]
    },
    {
        title: "Evrak Eşleştirme",
        url: "/scanneddocument",
        icon: "folder_match",
        roles: ["Gelen Evrak"]
    },
    {
        title: "Havale (AI)",
        url: "/havale",
        icon: "neurology",
        excludeRoles: ["Birim Evrak Sorumlusu"]
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
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Giden Evrak"]
    },
    {
        title: "Zarf Etiketi",
        url: "/ticket",
        icon: "book",
        roles: ["Gelen Evrak", "Birim Evrak Sorumlusu", "Giden Evrak"]
    },
    {
        title: "Teslim Al / Zimmetle",
        url: "/gidenevrak/zimmet",
        icon: "approval_delegation",
        roles: ["Gelen Evrak", "Giden Evrak"]
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
        excludeRoles: ["Birim Evrak Sorumlusu"]
    },
    {
        title: "Dış Kurumlar",
        url: "/externalinstitution",
        icon: "moving_ministry",
        excludeRoles: ["Birim Evrak Sorumlusu"]
    },
    {
        title: "Diller",
        url: "/parameters/languages",
        icon: "language_chinese_array",
        excludeRoles: ["Birim Evrak Sorumlusu"]
    },
    {
        title: "Raporlar",
        url: "/reports",
        icon: "monitoring",
        excludeRoles: ["Birim Evrak Sorumlusu"]
    }
];