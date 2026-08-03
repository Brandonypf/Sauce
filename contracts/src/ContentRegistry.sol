// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICreatorRegistry {
    function isRegisteredCreator(address creator)
        external
        view
        returns (bool);
}

contract ContentRegistry {

    struct Content {
        uint256 id;
        address creator;
        string title;
        string metadataURI;
        bytes32 contentHash;
        uint256 price;
        bool active;
    }

    ICreatorRegistry public creatorRegistry;

    uint256 private nextContentId;

    mapping(uint256 => Content) private contents;

    event ContentRegistered(
        uint256 indexed contentId,
        address indexed creator,
        string title,
        uint256 price
    );    event ContentUpdated(
        uint256 indexed contentId,
        string metadataURI,
        uint256 price
    );

    event ContentStatusChanged(
        uint256 indexed contentId,
        bool active
    );


    constructor(address _creatorRegistry) {
        require(
            _creatorRegistry != address(0),
            "Invalid creator registry"
        );

        creatorRegistry = ICreatorRegistry(_creatorRegistry);
    }


    function registerContent(
        string calldata title,
        string calldata metadataURI,
        bytes32 contentHash,
        uint256 price
    )
        external
        returns(uint256)
    {
        require(
            creatorRegistry.isRegisteredCreator(msg.sender),
            "Creator not registered"
        );

        require(
            bytes(title).length > 0,
            "Title required"
        );

        nextContentId++;

        contents[nextContentId] = Content({
            id: nextContentId,
            creator: msg.sender,
            title: title,
            metadataURI: metadataURI,
            contentHash: contentHash,
            price: price,
            active: true
        });


        emit ContentRegistered(
            nextContentId,
            msg.sender,
            title,
            price
        );

        return nextContentId;
    }    function getContent(
        uint256 contentId
    )
        external
        view
        returns(Content memory)
    {
        require(
            contents[contentId].active,
            "Content not active"
        );

        return contents[contentId];
    }


    function exists(
        uint256 contentId
    )
        external
        view
        returns(bool)
    {
        return contents[contentId].id != 0;
    }


    function getPrice(
        uint256 contentId
    )
        external
        view
        returns(uint256)
    {
        return contents[contentId].price;
    }


    function updateContent(
        uint256 contentId,
        string calldata metadataURI,
        uint256 price
    )
        external
    {
        Content storage content = contents[contentId];

        require(
            content.creator == msg.sender,
            "Not content owner"
        );

        content.metadataURI = metadataURI;
        content.price = price;


        emit ContentUpdated(
            contentId,
            metadataURI,
            price
        );
    }
}