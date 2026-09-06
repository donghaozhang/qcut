# 复杂滤镜独立迁移剩余清单

日期：2026-09-06。本机 892 张目录快照，三批累计迁移 45 张复杂滤镜后剩余 179 张。

本表不是可用性承诺。`available` 只表示旧目录能力，不能算自有 Metal 已实现。
原始二进制、Shader、LUT、模型均留在仓库外；这里只记录已有目录元数据。

详见 [第一批实现与测试](independent-complex-migration-2026-09-06.zh.md)、[第二批 13 张及全量回归](independent-complex-batch2-2026-09-06.zh.md) 和 [第三批 6 张、等价双 LUT 与库存审计](independent-complex-batch3-2026-09-06.zh.md)。

本轮重新核对完整目录：剩余 179 张中 175 张有包，4 张缺包（两张鎏金夜、落日橘光、晴海增色）。禁用剪映用户缓存后，仅私有目录能发现 888 张，剩 175 张；不能据此把缺包的 4 张从完整迁移清单中扣掉。

## shader (10)

| 资源 ID | 名称 | 旧目录可用 | 声明依赖 |
| --- | --- | --- | --- |
| 7232217903536409893 | 旧时代II | 是 | blit, face |
| 7127578859217620254 | KV5D | 是 | 未声明 |
| 7239977329668263227 | 旧乐园 | 是 | blit |
| 7468943213143821587 | 璀璨 | 是 | blit, face, kira |
| 7462636960557927699 | 粉蓝烟花 | 是 | blit, matting |
| 7551730483399314751 | 偏振镜 | 是 | blit, matting, sky_seg |
| 7463372376038755603 | 热气腾腾 | 是 | 未声明 |
| 7221805176410180921 | 黑胶唱片 | 是 | 未声明 |
| 7160580722774920461 | 沙砾 | 是 | blit |
| 7447126702137904420 | 电影柔光 | 是 | 未声明 |

## dual-lut (131)

| 资源 ID | 名称 | 旧目录可用 | 声明依赖 |
| --- | --- | --- | --- |
| 7617814057051016484 | 晴空海岸 | 是 | blit, skin_seg |
| 7617815643072564499 | 夏日甜心 | 是 | blit, skin_seg |
| 7330581892510649636 | 鲜美 | 是 | blit, face, skin_seg |
| 7617815642690850111 | 健美 | 是 | blit, skin_seg |
| 7392898023505792319 | 蓝调时刻 | 是 | blit, face, skin_seg |
| 7503403496117521690 | 逆光拯救 | 是 | blit, skin_seg |
| 7525754134151105833 | 粉霞 | 是 | blit, skin_seg |
| 7493462285889899803 | Pocket3 | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7341302999068757259 | 夜景增色 | 是 | blit, face, skin_seg |
| 7507148382536764682 | 画质修复 | 是 | blit, face, skin_seg |
| 7392898170524618023 | 晚霞增色 | 是 | blit, face, skin_seg |
| 7617813525322403113 | 生命力 | 是 | blit, skin_seg |
| 7617812952967679274 | 自然绿意 | 是 | blit, skin_seg |
| 7127822311708691726 | 宿营 | 是 | blit, skin_seg |
| 7431187754379136266 | 高清暖调 | 是 | 未声明 |
| 7447157317457513743 | 富士NN | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7551730848282742070 | 缎光肌 | 是 | blit, face, face_fitting, matting, scene_normal, skin_seg |
| 7617813566854286655 | 复古质感 | 是 | blit, skin_seg |
| 7239236880858877217 | 美高 | 是 | blit, skin_seg |
| 7195889899738909990 | 怦然心动 | 是 | blit, skin_seg |
| 7617811392120507690 | 高饱和胶片 | 是 | blit, skin_seg |
| 7239979137404833083 | 画报 | 是 | blit, skin_seg |
| 7332345211621887251 | 美好瞬间 | 是 | blit, face, skin_seg |
| 7263360572404550931 | City Walk | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7617812345930124580 | 复古棕调 | 是 | blit, skin_seg |
| 7332396398157090089 | 暮色约会 | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7239235794744003851 | 俱乐部 | 是 | blit, skin_seg |
| 7361792059109313811 | 哈苏蓝 | 是 | 未声明 |
| 7263357855678467364 | 街头 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7195812984306814267 | 初恋 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7195816046077496635 | Ditto | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7232218563270954300 | 旧时代I | 是 | blit, skin_seg |
| 7322665314980859177 | 繁花如梦 | 是 | blit, skin_seg |
| 7337928347118275890 | 哥谭 | 是 | blit, face, skin_seg |
| 7226995248814165308 | 好莱坞II | 是 | blit, skin_seg |
| 7127671508264078599 | 青灰 | 是 | blit, skin_seg |
| 7341266486536768831 | 黑金红 | 是 | blit, face, skin_seg |
| 7462637606052941095 | 夜拍高光 | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7411476796526300452 | 增色II | 是 | blit, face, skin_seg |
| 7281165355353951543 | 冷月夜 | 是 | blit, skin_seg |
| 7281166048273943867 | 仲夏夜 | 是 | blit, skin_seg |
| 7127561047048850718 | 橙蓝 | 是 | blit, skin_seg |
| 7328363887542209828 | 蓝调烟火 | 是 | blit, skin_seg |
| 7127618237117877518 | 冷蓝 | 是 | blit, skin_seg |
| 7127622617699290399 | 红绿 | 是 | blit, skin_seg |
| 7281575818621455628 | 青红夜 | 是 | blit, skin_seg |
| 7127655008715230495 | 亮肤 | 是 | blit, skin_seg |
| 7434467628422270220 | 冷调CCD | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7127656350833806622 | 料理 | 是 | blit, skin_seg |
| 7127675183246200072 | 烘培 | 是 | blit, skin_seg |
| 7127668806398315806 | 西餐 | 是 | blit, skin_seg |
| 7617811076125576454 | 明艳 | 是 | blit, skin_seg |
| 7281162426219859255 | 海山 | 是 | blit, skin_seg |
| 7462637393783360809 | 冰雪白 | 是 | blit, face, skin_seg |
| 7226991425160858937 | 去灰II | 是 | 未声明 |
| 7283013745788357925 | 增色 | 是 | blit, skin_seg |
| 7473437502787816740 | 去雾 | 是 | blit, skin_seg |
| 7478895015901613375 | 8K画质 | 是 | blit, face, skin_seg |
| 7377370363035979034 | 阿勒泰 | 是 | blit, face, skin_seg |
| 7403664465390013735 | 美食增色 | 是 | blit, face, skin_seg |
| 7330579916272012580 | 风味 | 是 | blit, face, skin_seg |
| 7330588808666156307 | 香浓 | 是 | blit, face, skin_seg |
| 7127655700532186398 | 法餐 | 是 | blit, skin_seg |
| 7330584144524643595 | 家宴 | 是 | blit, face, skin_seg |
| 7413717074037525769 | 暗调发光 | 是 | blit, face, skin_seg |
| 7221472488079904060 | 岩灰 | 是 | blit, skin_seg |
| 7413716485396368679 | 暗金 | 是 | blit, face, skin_seg |
| 7221479156318489893 | IG白 | 是 | blit, skin_seg |
| 7221481120083283257 | 浅茶 | 是 | blit, skin_seg |
| 7252673818035064124 | 桃木 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7221477781043973413 | 米棕 | 是 | blit, skin_seg |
| 7127675195812351239 | 原木 | 是 | blit, skin_seg |
| 7127608212483820837 | 复古工业 | 是 | blit, skin_seg |
| 7617812821895662867 | 野性 | 是 | blit, skin_seg |
| 7242215081663008056 | 森山 | 是 | blit, skin_seg |
| 7242211155131862332 | 暮光 | 是 | blit, skin_seg |
| 7242208887883992381 | 布兰卡 | 是 | blit, skin_seg |
| 7411477748130139403 | 夜景增色II | 是 | blit, face, skin_seg |
| 7341300292148907327 | 蓝金 | 是 | blit, face, skin_seg |
| 7328364126449765671 | 暗夜明肤 | 是 | blit, skin_seg |
| 7328363415313993001 | 烟花璀璨 | 是 | blit, skin_seg |
| 7127823362356727077 | 雾野 | 是 | blit, skin_seg |
| 7211008985187487036 | 花间 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7246723856222719269 | 山晴 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7510128089511349555 | 森绿 | 是 | blit, skin_seg |
| 7145394266209127694 | 银蓝 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7617817262107413802 | 粉霓虹 | 是 | blit, skin_seg |
| 7223645151820877093 | INS暗 | 是 | blit, skin_seg |
| 7145390299370638600 | 镜粉 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7213573482850880827 | 羽梦 | 是 | blit, skin_seg |
| 7223712396769119545 | 黑曜 | 是 | blit, skin_seg |
| 7617812708397731113 | 美式复古 | 是 | blit, skin_seg |
| 7177725752513793284 | 暗银 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7237440664139484473 | 蓝梦核 | 是 | blit, skin_seg |
| 7237441824611224889 | 多巴胺 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7213576268346838333 | 月辉 | 是 | blit, skin_seg |
| 7377370067798985993 | 梦幻夏 | 是 | blit, skin_seg |
| 7617814012545371398 | 松弛假日 | 是 | blit, skin_seg |
| 7617813008064040198 | 鲜活 | 是 | blit, skin_seg |
| 7377370212749839667 | 凉夏 | 是 | blit, face, skin_seg |
| 7361398032753020201 | 海水正蓝 | 是 | blit, skin_seg |
| 7525755037050539307 | 晴海 | 是 | blit, skin_seg |
| 7297144048903556388 | 煦日 | 是 | blit, skin_seg |
| 7320436048134147340 | 高清 | 是 | blit, skin_seg |
| 7426668776491453707 | 高清增强 | 是 | blit, skin_seg |
| 7325426821267295551 | 高清II | 是 | blit, skin_seg |
| 7302338645938261287 | 超白 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7485292050917657906 | 佳能G12 | 是 | ext_texture_producer, face, skin_seg, texture_blit |
| 7226994246471945530 | 富士蓝II | 是 | blit, skin_seg |
| 7361792068475325735 | 奥林巴斯 | 是 | blit, face, skin_seg |
| 7226994214029184313 | 富士青 | 是 | blit, skin_seg |
| 7451897248885099795 | 智能光线 | 是 | blit, matting, script, skin_seg |
| 7538027894447131967 | 背景增色 | 是 | blit, skin_seg |
| 7320434750018047251 | 鲜明 | 是 | blit, skin_seg |
| 7530582568769522980 | 通透 | 是 | blit, face, skin_seg |
| 7617812799330307364 | 多彩世界 | 是 | blit, skin_seg |
| 7234795543178775868 | 阳光肤 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7302334059890478347 | 明肤 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7312617341710372107 | 好莱坞III | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7337929426493132058 | 蓝橙II | 是 | blit, face, skin_seg |
| 7312646650202262820 | 雾都 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7131643870714006821 | 里昂 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7312646683672825100 | 都市 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7337932621046910262 | 青黄II | 是 | blit, face, skin_seg |
| 7271145889119440147 | 邂逅 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7131656881805741325 | 爱之城 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7202480720843984131 | 不要抬头 | 是 | blit, skin_seg |
| 7202485617026977056 | 独行侠 | 是 | blit, skin_seg |
| 7234799040184012092 | 象牙白 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7234793127867878712 | 陶瓷肌 | 是 | ext_texture_producer, skin_seg, texture_blit |
| 7302338306849656127 | 去黄 | 是 | ext_texture_producer, skin_seg, texture_blit |

## face-ai (33)

| 资源 ID | 名称 | 旧目录可用 | 声明依赖 |
| --- | --- | --- | --- |
| 7131507906737917220 | 小麦肌 | 是 | blit, face, skin_seg |
| 7131366613823114503 | 90s | 是 | blit, face, skin_seg |
| 7361791960652238143 | 过期电影卷 | 是 | blit, face, skin_seg |
| 7232220370667883837 | 蒸汽机 | 是 | blit, skin_seg |
| 7322665617373351231 | 繁花璀璨 | 是 | blit, skin_seg |
| 7131347316111314189 | 2077 | 是 | blit, face, skin_seg |
| 7495673180904885516 | 丝滑皮肤 | 是 | blit, face, matting, skin_seg, structxt |
| 7166470141494955297 | 蓝都 | 是 | blit, face, skin_seg |
| 7493076668009958668 | 春日樱 | 是 | blit, matting, scene_recognition, script, skin_seg |
| 7131513310733765918 | 旷野蓝 | 是 | blit, face, skin_seg |
| 7131419324622982408 | 莫吉托 | 是 | blit, face, skin_seg |
| 7131290518838938887 | 青提 | 是 | blit, face, skin_seg |
| 7408496787398446362 | 黑暗神话 | 是 | blit, skin_seg |
| 7131655685321821477 | 砂金 | 是 | blit, face, skin_seg |
| 7131322091839753502 | 酚蓝 | 是 | blit, face, skin_seg |
| 7131539023817936158 | 焰色 | 是 | blit, face, skin_seg |
| 7493083101426453796 | 鲜花增色 | 是 | blit, matting, scene_recognition, script, skin_seg |
| 7156647258342034702 | 粉白 | 是 | blit, face, skin_seg |
| 7446318175991368997 | 暗光提亮 | 是 | blit, matting, skin_seg |
| 7268563047776587020 | 徕卡II | 是 | blit, skin_seg |
| 7291560741885480250 | 哈苏II | 是 | blit, skin_seg |
| 7291596720956329266 | 哈苏I | 是 | blit, skin_seg |
| 7291595038688136474 | 佳能G7X III | 是 | blit, skin_seg |
| 7332480052392774975 | FXN | 是 | blit, face, skin_seg |
| 7168097661160131879 | GR蓝 | 是 | blit, face, skin_seg |
| 7320428711487098153 | 聚焦 | 是 | blit, skin_seg |
| 7398486193924623628 | 模糊氛围 | 是 | blit, skin_seg |
| 7148844086869396743 | 人生之事 | 是 | blit, face, skin_seg |
| 7226994281414692155 | 好莱坞I | 是 | blit, face, skin_seg |
| 7322666518536359204 | 繁花似锦 | 是 | blit, skin_seg |
| 7268562944093408523 | 徕卡I | 是 | blit, skin_seg |
| 7672306518011776266 | 鎏金夜 | 否 | blit, face, face_fitting, matting, scene_normal, skin_seg |
| 7672306701118262554 | 鎏金夜 | 否 | blit, face, face_fitting, matting, scene_normal, skin_seg |

## face-region-lut (3)

| 资源 ID | 名称 | 旧目录可用 | 声明依赖 |
| --- | --- | --- | --- |
| 7127674287238008078 | 焕肤 | 是 | blit, face |
| 7127671519450303775 | 裸粉 | 是 | blit, face |
| 7127666004477414687 | 净透 | 是 | blit, face |

## unknown (2)

| 资源 ID | 名称 | 旧目录可用 | 声明依赖 |
| --- | --- | --- | --- |
| 7659347184361622826 | 落日橘光 | 否 | blit |
| 7669796773006708019 | 晴海增色 | 否 | blit |
