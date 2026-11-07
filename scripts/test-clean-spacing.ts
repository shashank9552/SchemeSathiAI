function cleanSpacing(text: string): string {
  return text
    // 1. Fix multi-part dates first: "20. 09. 2022" -> "20.09.2022"
    .replace(/(\b\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4}\b)/g, '$1.$2.$3')
    // 2. Fix decimal numbers: "1. 00" -> "1.00", "2. 5" -> "2.5"
    .replace(/(\b\d+)\.\s+(\d+\b)/g, '$1.$2')
    // 3. Fix URL domain spacing: "innovative. msme. gov. in" -> "innovative.msme.gov.in"
    .replace(/(\b(?:https?:\/\/|www\.)[a-z0-9\-]+)\.\s+([a-z0-9\-]+)/gi, '$1.$2')
    .replace(/([a-z0-9\-]+)\.\s+(msme|gov|nic)\.\s*(in|gov\.in)\b/gi, '$1.$2.$3')
    .replace(/(https?:\/\/[^\s]+)\.\s+(gov\.in|in)\b/gi, '$1.$2')
    // 4. Repeated domain parts: e.g. "something. msme. gov. in"
    .replace(/([a-z0-9\-]+)\.\s+msme\.\s+gov\.\s+in\b/gi, '$1.msme.gov.in');
}

const s1 = "in the virtual event: Upto Rs. 1. 00 lakh. Organising Mega";
const s2 = "The Ministry on 20. 09. 2022 has signed MoUs with 18";
const s3 = "visit https://innovative. msme. gov. in for details";
const s4 = "infrastructure, drainage, power distribution etc. in new/existing industrial";

console.log('1:', cleanSpacing(s1));
console.log('2:', cleanSpacing(s2));
console.log('3:', cleanSpacing(s3));
console.log('4:', cleanSpacing(s4));
