const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { SignedXml } = require('xml-crypto');
const { create } = require('xmlbuilder2');

class NFeService {
    constructor(pfxPath, password, isProduction = false) {
        // Caminho padrão caso não seja passado
        const defaultPfxPath = path.join(__dirname, '../certificado/certificado.pfx');

        this.pfxPath = pfxPath || defaultPfxPath;
        this.password = password;
        this.isProduction = isProduction;

        // Tenta carregar. Se falhar, o erro explode AQUI com mensagem clara.
        try {
            this.certInfo = this._loadCert();
        } catch (e) {
            throw new Error(`Falha ao ler certificado (.pfx). Verifique se a senha está correta. Detalhes: ${e.message}`);
        }
    }

    _loadCert() {
        if (!fs.existsSync(this.pfxPath)) {
            throw new Error(`Arquivo de certificado não encontrado no caminho: ${this.pfxPath}`);
        }
        
        const pfxFile = fs.readFileSync(this.pfxPath);
        
        if (pfxFile.length === 0) {
            throw new Error("O arquivo de certificado está vazio (0 bytes).");
        }

        const pfxDer = pfxFile.toString('binary');
        const pfxAsn1 = forge.asn1.fromDer(pfxDer);
        
        // É aqui que a senha é validada
        const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, this.password);

        const bags = pfx.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = bags[forge.pki.oids.certBag][0];
        const cert = certBag.cert;

        const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
        const privateKey = keyBag.key;

        return {
            cert: forge.pki.certificateToPem(cert),
            key: forge.pki.privateKeyToPem(privateKey),
            commonName: cert.subject.getField('CN').value
        };
    }

    generateChaveAcesso(params) {
        const { cUF, year, month, cnpj, mod, serie, nNF, tpEmis, cNF } = params;
        
        // Força o tamanho correto de cada campo com zeros à esquerda
        const sUF = cUF.toString().padStart(2, '0');
        const sAno = year.toString().padStart(2, '0');
        const sMes = month.toString().padStart(2, '0');
        const sCnpj = cnpj.replace(/\D/g, '').padStart(14, '0');
        const sMod = mod.toString().padStart(2, '0');
        const sSerie = serie.toString().padStart(3, '0');
        const sNumero = nNF.toString().padStart(9, '0');
        const sEmis = tpEmis.toString().padStart(1, '0');
        const sCodigo = cNF.toString().padStart(8, '0');
    
        const chaveSemDV = `${sUF}${sAno}${sMes}${sCnpj}${sMod}${sSerie}${sNumero}${sEmis}${sCodigo}`;
        const dv = this._calculateDV(chaveSemDV);
        return chaveSemDV + dv; // Retorna sempre 44 caracteres
    }

    _calculateDV(chave) {
        let peso = 2;
        let soma = 0;
        for (let i = chave.length - 1; i >= 0; i--) {
            soma += parseInt(chave[i]) * peso;
            peso = (peso === 9) ? 2 : peso + 1;
        }
        const resto = soma % 11;
        return (resto === 0 || resto === 1) ? 0 : 11 - resto;
    }

    createNFeXML(dados) {
        const { ide, emit, dest, det, total, transp, infAdic } = dados;

        const obj = {
            NFe: {
                '@xmlns': 'http://www.portalfiscal.inf.br/nfe',
                infNFe: {
                    '@Id': `NFe${ide.chaveAcesso}`,
                    '@versao': '4.00',
                    ide: {
                        cUF: ide.cUF,
                        cNF: ide.cNF,
                        natOp: ide.natOp,
                        mod: ide.mod,
                        serie: ide.serie,
                        nNF: ide.nNF,
                        dhEmi: ide.dhEmi,
                        tpNF: ide.tpNF,
                        idDest: ide.idDest,
                        cMunFG: ide.cMunFG,
                        tpImp: ide.tpImp,
                        tpEmis: ide.tpEmis,
                        cDV: ide.chaveAcesso.slice(-1),
                        tpAmb: this.isProduction ? '1' : '2',
                        finNFe: ide.finNFe,
                        indFinal: ide.indFinal,
                        indPres: ide.indPres,
                        procEmi: '0',
                        verProc: '1.0.0'
                    },
                    emit: {
                        CNPJ: emit.cnpj,
                        xNome: emit.xNome,
                        xFant: emit.xFant,
                        enderEmit: typeof emit.enderEmit === 'string' ? JSON.parse(emit.enderEmit) : emit.enderEmit,
                        IE: emit.ie,
                        CRT: emit.crt
                    },
                    dest: {
                        CNPJ: dest.cnpj || undefined,
                        CPF: dest.cpf || undefined,
                        xNome: this.isProduction
                            ? dest.xNome
                            : 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
                        enderDest: typeof dest.enderDest === 'string' ? JSON.parse(dest.enderDest) : dest.enderDest,
                        indIEDest: dest.indIEDest,
                        IE: dest.ie || undefined,
                        email: dest.email || undefined
                    },
                    det: det.map((item, index) => ({
                        '@nItem': index + 1,
                        prod: item.prod,
                        imposto: item.imposto
                    })),
                    total: {
                        ICMSTot: total.icmsTot
                    },
                    transp: {
                        modFrete: transp.modFrete
                    },
                    infAdic: {
                        infCpl: infAdic.infCpl
                    }
                }
            }
        };

        const xml = create({ version: '1.0', encoding: 'UTF-8' }, obj).end({ prettyPrint: false });
        return this._signXML(xml, 'infNFe');
    }

    _signXML(xml, tagId) {
        if (!this.certInfo) {
            throw new Error("Certificado não carregado. Verifique a senha.");
        }

        const sig = new SignedXml({
            privateKey: this.certInfo.key,
            publicCert: this.certInfo.cert,
            signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
            canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        });

        sig.addReference({
            xpath: `//*[local-name(.)='${tagId}']`,
            transforms: [
                'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
            ],
            digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
        });

        sig.keyInfoProvider = {
            getKeyInfo: () =>
                `<X509Data><X509Certificate>${
                    this.certInfo.cert.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n|\r/g, '')
                }</X509Certificate></X509Data>`
        };

        sig.computeSignature(xml, {
            location: { xpath: "//*[local-name(.)='NFe']", action: 'append' }
        });

        return sig.getSignedXml();
    }

    async transmitirSefaz(xmlAssinado, cUF) {
        const urls = {
            '35': {
                homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
                producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx'
            }
        };
    
        const url = urls[cUF] ? (this.isProduction ? urls[cUF].producao : urls[cUF].homologacao) : null;
        
        if (!url) return { success: false, status: 'erro', message: `URL não configurada para UF ${cUF}` };
    
        // Remova espaços extras e quebras de linha do XML assinado para evitar erro 400
        const xmlLimpo = xmlAssinado.replace(/\r?\n|\r/g, "").trim();
    
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
            <soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
                <soap12:Body>
                    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
                        ${xmlLimpo}
                    </nfeDadosMsg>
                </soap12:Body>
            </soap12:Envelope>`;
    
        try {
            const axios = require('axios');
            const https = require('https');
    
            const httpsAgent = new https.Agent({
                pfx: fs.readFileSync(this.pfxPath),
                passphrase: this.password,
                rejectUnauthorized: false 
            });
    
            const response = await axios.post(url, soapEnvelope, {
                headers: {
                    "Content-Type": "application/soap+xml; charset=utf-8",
                    "SOAPAction": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"
                },
                httpsAgent: httpsAgent,
                timeout: 30000
            });
    
            return { success: true, status: 'autorizada', message: 'Enviada com sucesso' };
        } catch (error) {
            // Log detalhado para identificar o que a SEFAZ respondeu no corpo do erro
            console.error("Erro SEFAZ Detalhado:", error.response ? error.response.data : error.message);
            throw new Error(`Erro de conexão SEFAZ: ${error.message}`);
        }
    }
}

module.exports = NFeService;