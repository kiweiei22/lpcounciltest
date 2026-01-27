
const thaiBadWords = [
    "กู", "มึง", "ควย", "เหี้ย", "สัตว์", "เย็ด", "หี", "แตด", "สัส", "ไอ้สัตว์", "พ่อมึงตาย", "แม่มึงตาย", "โคตรแม่", "โคตรพ่อ",
    "ดอกทอง", "อีดอก", "เลว", "โง่", "ควาย", "ระยำ", "ชาติหมา", "ชิบหาย", "สถุน", "เสนียด", "จัญไร", "วิบัติ",
    "ซวย", "หน้าตัวเมีย", "หน้าหี", "หมาไม่แดก", "แม่ง", "ไอ้เหี้ย", "ไอ้สัส", "ไอ้ควาย", "อีเหี้ย", "อีสัส", "อีควาย",
    "เยดแม่", "เยดพ่อ", "ควยไร", "ส้นตีน", "หน้าตีน", "ปากหมา", "ปากดี", "ไอ้เวร", "อีเวร", "ชาติชั่ว", "นรก", "ระยำหมา",
    "ลามปาม", "เสือก", "สารเลว", "ทุเรศ", "ปัญญาอ่อน", "บ้ากาม", "วิตถาร", "ไอ้หน้าโง่", "อีหน้าโง่", "ไอ้ขี้แพ้", "อีขี้แพ้",
    "ขยะเปียก", "ขยะสังคม", "เศษเดน", "เดรัจฉาน", "ไอ้บ้า", "อีบ้า", "ไอ้โง่", "อีโง่"
];

const englishBadWords = [
    "fuck", "shit", "bitch", "cunt", "asshole", "motherfucker", "dick", "pussy", "bastard", "whore", "slut", "wanker",
    "bullshit", "damn", "fucker", "fucking", "shitty", "cock", "suck", "ass", "idiot", "stupid", "moron", "retard",
    "jerk", "douchebag", "fag", "faggot", "nigger", "nigga", "sex", "porn", "xxx"
];

const allBadWords = [...thaiBadWords, ...englishBadWords];

export function filterText(text) {
    if (!text) return text;
    let filteredText = text;

    // Create a regex that matches any of the bad words, case insensitive
    // We sort by length descending so that longer phrases are matched first (e.g., "ไอ้เหี้ย" before "เหี้ย")
    const sortedBadWords = allBadWords.sort((a, b) => b.length - a.length);

    sortedBadWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filteredText = filteredText.replace(regex, '*'.repeat(word.length));
    });

    return filteredText;
}

export function containsProfanity(text) {
    if (!text) return false;
    const sortedBadWords = allBadWords.sort((a, b) => b.length - a.length);
    for (const word of sortedBadWords) {
        if (new RegExp(word, 'gi').test(text)) {
            return true;
        }
    }
    return false;
}
