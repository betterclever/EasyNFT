import {useState} from "react";
import {getTransaction, mintTokens, startAuction} from "../../utils/contractOps";
import {nftStorageClient} from "../../utils/nftStorage";
import {useInterval} from "../../hooks/useInterval";
import {PriceDistribution} from "./priceDistribution";
import {FileUploadButton} from "./fileUploadButton";
import {TextInputField} from "./textInputField";
import {PreviewSection} from "./previewSection";

const MINT_STAGE = {
    NOT_INITIATED: "NOT_INITIATED",
    UPLOADING: "UPLOADING",
    UPLOADED: "UPLOADED",
    VERIFYING_MINTING_TRANSACTION: "VERIFYING_MINTING_TRANSACTION",
    WAITING_FOR_TRANSACTION_COMPLETION: "WAITING_FOR_TRANSACTION_COMPLETION",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
}

const AUCTION_STAGE = {
    NOT_STARTED: "NOT_STARTED",
    VERIFYING_TRANSACTION: "VERIFYING_TRANSACTION",
    WAITING_FOR_TRANSACTION_COMPLETION: "WAITING_FOR_TRANSACTION_COMPLETION",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
}

export function FormSection() {
    const [files, setFiles] = useState([]);
    const [tokenIds, setTokenIds] = useState([]);
    const [mintStage, setMintStage] = useState(MINT_STAGE.NOT_INITIATED);
    const [auctionStage, setAuctionStage] = useState(AUCTION_STAGE.NOT_STARTED);
    const [collectionName, setCollectionName] = useState("");
    const [auctionDuration, setAuctionDuration] = useState(0);
    const [collectionId, setCollectionId] = useState(null);

    const [mintTrx, setMintTrx] = useState({
        id: null,
        transaction: null,
        resultAwaited: false
    })

    const [startAuctionTrx, setStartAuctionTrx] = useState({
        id: null,
        transaction: null,
        resultAwaited: false
    })

    function getTokenIdsFromReceipt(receipt) {
        const events =  receipt.event_logs;
        const tokenIds = events.filter(e => e._eventname === "MintSuccess").map((e) => {
            const params = e.params;
            const tokenId = params.find(p => p.vname === 'token_id');
            return tokenId.value
        })
        tokenIds.reverse();
        console.log(tokenIds)
        return tokenIds
    }

    function getCollectionId(receipt) {
        return ""
    }

    useInterval(async () => {
        if (mintTrx.resultAwaited === true && mintTrx.id !== null) {
            try {
                const trxData = await getTransaction(mintTrx.id);
                const receipt = trxData?.receipt;
                if (receipt !== undefined) {
                    setMintTrx({
                        id: mintTrx.id,
                        transaction: trxData,
                        resultAwaited: false
                    })
                    const success = receipt.success;
                    if(success) {
                        setMintStage(MINT_STAGE.COMPLETED);
                        const nftIds = getTokenIdsFromReceipt(receipt);
                        setTokenIds(nftIds);
                    } else {
                        setMintStage(MINT_STAGE.FAILED);
                    }
                }
            } catch (ex) {
                console.error(ex)
            }
        }

        if(startAuctionTrx.resultAwaited === true && startAuctionTrx.id !== null) {
            try {
                const trx = await getTransaction(startAuctionTrx.id);
                const receipt = trx?.receipt;
                if (receipt !== undefined) {
                    setStartAuctionTrx({
                        id: mintTrx.id,
                        transaction: trx,
                        resultAwaited: false
                    })
                    const success = receipt.success;
                    if(success) {
                        setAuctionStage(AUCTION_STAGE.COMPLETED);
                        const collectionId = getCollectionId(receipt);
                        setCollectionId(collectionId);
                    } else {
                        setAuctionStage(AUCTION_STAGE.FAILED);
                    }
                }
            } catch(e) {
                console.error(e)
            }
        }

    }, 1000);

    function postImage(file) {
        return nftStorageClient.store({
            name: 'Test 2',
            description: 'Test image 2',
            image: file
        });
    }

    async function uploadImagesToIPFS() {
        try {
            const promises = Array.from(files).map(async (file) => postImage(file));
            const result = await Promise.all(promises);
            console.log("result", result);
            return result
        } catch (error) {
            console.log(error)
        }
    }

    async function mintCollection() {
        setMintStage(MINT_STAGE.UPLOADING);
        const ipfsLinks = await uploadImagesToIPFS();
        setMintStage(MINT_STAGE.UPLOADED);
        setMintStage(MINT_STAGE.VERIFYING_MINTING_TRANSACTION);
        const trx = await mintTokens(ipfsLinks.map(l => l.url));
        setMintStage(MINT_STAGE.WAITING_FOR_TRANSACTION_COMPLETION);
        console.log(trx);

        // Reset the minTrxState
        setMintTrx({
            id: trx.ID,
            resultAwaited: true,
            transaction: trx
        })
    }

    async function startAuctionForCollection() {
        if(!tokenIds.isEmpty()) {
            const nftIds = tokenIds;
            const distributionPrices = tokenIds.map(t => 1000);
            const cName = collectionName;
            // Auction time in block count
            const auctionBlockCount = auctionDuration * 60 / 2;

            setAuctionStage(AUCTION_STAGE.VERIFYING_TRANSACTION);
            const trx = await startAuction(nftIds, distributionPrices, auctionBlockCount)
            setAuctionStage(AUCTION_STAGE.WAITING_FOR_TRANSACTION_COMPLETION);
            setStartAuctionTrx({
                id: trx.ID,
                resultAwaited: true
            })
        }
    }


    return <div className="grid grid-cols-12">
        <div className="col-span-4 mt-20 ml-10 flex flex-col">
            <div> Step: 1</div>
            {
                (mintStage === MINT_STAGE.NOT_INITIATED || mintStage === MINT_STAGE.FAILED) &&
                <div className="flex flex-col">
                    <FileUploadButton setFiles={setFiles}/>
                    <button
                        className="mt-6 mx-4 align-middle bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                        onClick={mintCollection}>
                        <span className="content-center w-full"> Mint NFTs </span>
                    </button>
                </div>
            }

            {(mintStage === MINT_STAGE.UPLOADING) &&
                <span> Uploading to IPFS </span>
            }
            {(mintStage === MINT_STAGE.UPLOADED) &&
                <span> Files Uploaded to IPFS </span>
            }
            {(mintStage === MINT_STAGE.VERIFYING_MINTING_TRANSACTION) &&
                <span> Verifying minting transaction </span>
            }
            {(mintStage === MINT_STAGE.WAITING_FOR_TRANSACTION_COMPLETION) &&
                <span> Waiting for transaction completion </span>
            }
            {(mintStage === MINT_STAGE.COMPLETED) &&
                <span> Minting successful </span>
            }

            <div className="mt-10"> Step: 2</div>
            <TextInputField fieldLabel="Collection Name" onInputChange={(input) => setCollectionName(input)}/>
            <TextInputField fieldLabel="Auction Duration" placeHolder={"in hrs"} onInputChange={(input) => setAuctionDuration(input)}/>
            <PriceDistribution/>

            <button
                className="mt-6 mb-20 mx-4 align-middle bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold py-2 px-4 rounded inline-flex items-center"
                onClick={startAuctionForCollection}>
                <span className="content-center w-full"> Start Auction </span>
            </button>
        </div>
        <PreviewSection files={files}/>
    </div>
}