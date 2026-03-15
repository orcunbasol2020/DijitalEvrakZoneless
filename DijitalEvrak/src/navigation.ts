export interface NavigationModel {
    title?: string;
    url?: string;
    icon?: string;
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
        title: "Ön Kayıt",
        url: "/onkayit",
        icon: "app_registration"
    },
    {
        title: "Evrak Kayıt",
        url: "/qrokut",
        icon: "qr_code"
    },
    {
        title: "Gelen Evraklar",
        url: "/scanlist",
        icon: "add_notes"
    },
    {
        title: "Zimmet",
        url: "/zimmet",
        icon: "contract_edit"
    },
    {
        title: "Evrak Eşleştirme",
        url: "/scanneddocument",
        icon: "folder_match"
    },
    {
        title: "Havale (AI)",
        url: "/havale",
        icon: "neurology"
    },
    {
        title: "OCR Takip",
        url: "/ocrtakip",
        icon: "document_scanner"
    },
    {
        category: "Giden Evrak",
        title: "Giden Taranmış Evraklar",
        url: "/gidenscanlist",
        icon: "add_notes"
    },
    {
        title: "Giden QR List",
        url: "/gidenqrlist",
        icon: "qr_code"
    },
    {
        title: "Giden Evrak Takip",
        url: "/gelenevraktakip",
        icon: "article_shortcut"
    },
    {
        category: "Kullanıcılar",
        title: "Kullanıcı Listesi",
        url: "/users",
        icon: "diversity_3"
    },
    {
        title: "Roller",
        url: "users/role",
        icon: "security"
    },
    {
        category: "Parametreler",
        title: "QR Oluştur",
        url: "/qrlist",
        icon: "qr_code"
    },
    {
        title: "Birimler",
        url: "/birimler",
        icon: "moving_ministry"
    },
    {
        title: "Diller",
        url: "parameters/languages",
        icon: "language_chinese_array"
    }

]